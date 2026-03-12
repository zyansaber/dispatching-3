import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { subscribePgiRecords, storage } from "@/lib/firebase";
import { sendPgiMissingEmail } from "@/lib/emailjs";
import type { PgiRecordData, PgiRecordEntry } from "@/types";
import { getDownloadURL, listAll, ref as storageRef } from "firebase/storage";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { useDashboardContext } from "./Index";

type PgiHistoryRow = PgiRecordEntry & {
  chassisNumber: string;
  entryId?: string;
};

type DeliveryDoc = {
  name: string;
  url: string;
  fullPath: string;
};

type PeriodFilter = "pgi2026" | "1m" | "3m" | "6m" | "custom";

type ChassisStatus = "inTransit" | "completed" | "missingPo";
type StatusFilter = "all" | ChassisStatus;

const isRecordEntry = (value: unknown): value is PgiRecordEntry => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return [
    "dealer",
    "poNumber",
    "vendorName",
    "grStatus",
    "grDateLast",
    "customer",
    "model",
    "pgidate",
    "vinNumber",
  ].some((key) => key in candidate);
};

const flattenPgiRecords = (data: PgiRecordData) => {
  const rows: PgiHistoryRow[] = [];

  Object.entries(data || {}).forEach(([chassisNumber, entries]) => {
    if (isRecordEntry(entries)) {
      rows.push({ chassisNumber, ...entries });
      return;
    }

    if (!entries || typeof entries !== "object") return;
    Object.entries(entries).forEach(([entryId, entry]) => {
      if (!isRecordEntry(entry)) return;
      rows.push({
        chassisNumber,
        entryId,
        ...entry,
      });
    });
  });

  return rows;
};

const formatPrice = (value?: number | string | null) => {
  if (value == null || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parsePgiDate = (value?: string | null) => {
  if (!value) return null;
  const parts = value.trim().split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map((part) => Number.parseInt(part, 10));
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const getChassisStatus = (record: PgiHistoryRow): ChassisStatus => {
  const poNumber = record.poNumber ? String(record.poNumber).trim() : "";
  if (!poNumber) return "missingPo";
  const status = record.grStatus ? String(record.grStatus).toLowerCase() : "";
  if (status.includes("posted") || status.includes("completed")) return "completed";
  return "inTransit";
};

const formatMonthLabel = (value: string) => {
  const [year, month] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
};

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);

const formatDateRange = (start?: string, end?: string) => {
  if (!start && !end) return "Custom range";
  if (start && end) return `${start} → ${end}`;
  return start ? `From ${start}` : `Until ${end}`;
};

const isNoGrStatus = (value?: string | null) => {
  if (!value) return true;
  return value.toLowerCase().includes("no gr");
};

const csvEscape = (value: string) => {
  if (value.includes("\"") || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
};


const isMissingDeliveryDocAfter7Days = (
  record: PgiHistoryRow,
  docsByChassis: Map<string, DeliveryDoc[]>
) => {
  const pgiDate = parsePgiDate(record.pgidate ? String(record.pgidate) : "");
  if (!pgiDate) return false;
  const ageDays = (Date.now() - pgiDate.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 7) return false;
  const docs = docsByChassis.get(record.chassisNumber) || [];
  return docs.length === 0;
};

const PGIHistoryPage: React.FC = () => {
  const {
    transportCompanies,
    dealerEmails,
    pgiEmailTemplate,
    handleSavePgiEmailTemplate,
  } = useDashboardContext();
  const [records, setRecords] = useState<PgiHistoryRow[]>([]);
  const [deliveryDocs, setDeliveryDocs] = useState<DeliveryDoc[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(true);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("pgi2026");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [dealerFilter, setDealerFilter] = useState<string>("all");
  const [onlyNoGr, setOnlyNoGr] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [chassisSearch, setChassisSearch] = useState<string>("");
  const [customStart, setCustomStart] = useState<string>(() =>
    formatDateInput(new Date(new Date().getFullYear(), 0, 1))
  );
  const [customEnd, setCustomEnd] = useState<string>(() =>
    formatDateInput(new Date())
  );
  const [selectedDealerRisk, setSelectedDealerRisk] = useState<string>("all");
  const [multipleEmailMode, setMultipleEmailMode] = useState<boolean>(false);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [recipientType, setRecipientType] = useState<"dealer" | "vendor">("dealer");
  const [showTemplateEditor, setShowTemplateEditor] = useState<boolean>(false);
  const [templateSubject, setTemplateSubject] = useState<string>(
    pgiEmailTemplate?.subject || "Missing Delivery Document Follow-up"
  );
  const [templateBody, setTemplateBody] = useState<string>(
    pgiEmailTemplate?.body ||
      "Dear Team,\n\nThe following chassis is still missing Delivery Doc for more than 7 days after PGI.\n\nChassis Number: {{chassis_number}}\nPGI Date: {{pgi_date}}\nVendor Name: {{vendor_name}}\n\nPlease action urgently."
  );

  useEffect(() => {
    const unsubscribe = subscribePgiRecords((data: PgiRecordData) => {
      const rows = flattenPgiRecords(data);
      rows.sort((a, b) => (a.chassisNumber || "").localeCompare(b.chassisNumber || ""));
      setRecords(rows);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!pgiEmailTemplate) return;
    setTemplateSubject(pgiEmailTemplate.subject || "Missing Delivery Document Follow-up");
    setTemplateBody(pgiEmailTemplate.body || "");
  }, [pgiEmailTemplate]);

  useEffect(() => {
    let isMounted = true;
    const fetchDocs = async () => {
      setIsLoadingDocs(true);
      try {
        const folderRef = storageRef(storage, "deliverydoc");
        const list = await listAll(folderRef);
        const docs = await Promise.all(
          list.items.map(async (item) => ({
            name: item.name,
            fullPath: item.fullPath,
            url: await getDownloadURL(item),
          }))
        );
        if (isMounted) {
          setDeliveryDocs(docs);
        }
      } catch (error) {
        console.error("Failed to load delivery docs", error);
      } finally {
        if (isMounted) {
          setIsLoadingDocs(false);
        }
      }
    };
    fetchDocs();
    return () => {
      isMounted = false;
    };
  }, []);

  const vendorOptions = useMemo(() => {
    const values = new Set<string>();
    records.forEach((record) => {
      const vendor = record.vendorName ? String(record.vendorName).trim() : "";
      if (vendor) values.add(vendor);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const dealerOptions = useMemo(() => {
    const values = new Set<string>();
    records.forEach((record) => {
      const dealer = record.dealer ? String(record.dealer).trim() : "";
      if (dealer) values.add(dealer);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const now = new Date();

    return records.filter((record) => {
      if (vendorFilter !== "all") {
        const vendor = record.vendorName ? String(record.vendorName).trim() : "";
        if (vendor !== vendorFilter) return false;
      }

      if (dealerFilter !== "all") {
        const dealer = record.dealer ? String(record.dealer).trim() : "";
        if (dealer !== dealerFilter) return false;
      }

      if (onlyNoGr && !isNoGrStatus(record.grStatus ? String(record.grStatus) : "")) {
        return false;
      }

      if (statusFilter !== "all" && getChassisStatus(record) !== statusFilter) {
        return false;
      }

      if (chassisSearch.trim()) {
        const search = chassisSearch.trim().toLowerCase();
        const chassis = record.chassisNumber ? String(record.chassisNumber).toLowerCase() : "";
        if (!chassis.includes(search)) return false;
      }

      const pgiDate = parsePgiDate(record.pgidate ? String(record.pgidate) : "");
      if (!pgiDate) return false;

      if (periodFilter === "pgi2026") {
        return pgiDate.getFullYear() === 2026;
      }

      if (periodFilter === "custom") {
        const start = customStart ? new Date(customStart) : null;
        const end = customEnd ? new Date(customEnd) : null;
        if (start && Number.isNaN(start.getTime())) return false;
        if (end && Number.isNaN(end.getTime())) return false;
        if (start && pgiDate < start) return false;
        if (end) {
          const endOfDay = new Date(end);
          endOfDay.setHours(23, 59, 59, 999);
          if (pgiDate > endOfDay) return false;
        }
        return true;
      }

      const monthsBack = periodFilter === "1m" ? 1 : periodFilter === "3m" ? 3 : 6;
      const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, now.getDate());
      return pgiDate >= cutoff;
    });
  }, [
    customEnd,
    customStart,
    dealerFilter,
    chassisSearch,
    onlyNoGr,
    periodFilter,
    records,
    statusFilter,
    vendorFilter,
  ]);

  const sortedRecords = useMemo(() => {
    const monthFilteredRecords =
      selectedMonth === "all"
        ? filteredRecords
        : filteredRecords.filter((record) => {
            const date = parsePgiDate(record.pgidate ? String(record.pgidate) : "");
            if (!date) return false;
            const monthValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            return monthValue === selectedMonth;
          });
    const items = [...monthFilteredRecords];
    items.sort((a, b) => {
      const dateA = parsePgiDate(a.pgidate ? String(a.pgidate) : "")?.getTime() ?? 0;
      const dateB = parsePgiDate(b.pgidate ? String(b.pgidate) : "")?.getTime() ?? 0;
      if (dateA !== dateB) return dateB - dateA;
      return (a.chassisNumber || "").localeCompare(b.chassisNumber || "");
    });
    return items;
  }, [filteredRecords, selectedMonth]);

  const stats = useMemo(() => {
    const noGrCount = sortedRecords.filter((record) =>
      isNoGrStatus(record.grStatus ? String(record.grStatus) : "")
    ).length;
    const prices = sortedRecords
      .map((record) => {
        const raw = record.poPrice;
        if (raw == null || raw === "") return null;
        const value = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
        return Number.isFinite(value) ? value : null;
      })
      .filter((value): value is number => value != null);
    const totalPrice = prices.reduce((sum, value) => sum + value, 0);
    const averagePrice = prices.length ? totalPrice / prices.length : 0;
    return {
      totalPgi: sortedRecords.length,
      noGrCount,
      totalPrice,
      averagePrice,
    };
  }, [sortedRecords]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    filteredRecords.forEach((record) => {
      const date = parsePgiDate(record.pgidate ? String(record.pgidate) : "");
      if (!date) return;
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      months.add(value);
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [filteredRecords]);

  useEffect(() => {
    if (monthOptions.length === 0) {
      setSelectedMonth("all");
      return;
    }
    if (selectedMonth === "all" || !monthOptions.includes(selectedMonth)) {
      setSelectedMonth(monthOptions[0]);
    }
  }, [monthOptions, selectedMonth]);

  const chartData = useMemo(() => {
    if (selectedMonth === "all") return [];
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(month)) return [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const counts = Array.from({ length: daysInMonth }, () => 0);
    sortedRecords.forEach((record) => {
      const date = parsePgiDate(record.pgidate ? String(record.pgidate) : "");
      if (!date) return;
      if (date.getFullYear() !== year || date.getMonth() !== month) return;
      counts[date.getDate() - 1] += 1;
    });
    const maxCount = Math.max(...counts, 1);
    return counts.map((count, index) => ({
      day: index + 1,
      count,
      height: Math.max((count / maxCount) * 100, 6),
    }));
  }, [selectedMonth, sortedRecords]);

  const selectedMonthCount = sortedRecords.length;

  const docsByChassis = useMemo(() => {
    const map = new Map<string, DeliveryDoc[]>();
    sortedRecords.forEach((record) => {
      const chassis = record.chassisNumber;
      if (!chassis || map.has(chassis)) return;
      const matches = deliveryDocs.filter((doc) => doc.name.includes(chassis));
      if (matches.length) map.set(chassis, matches);
    });
    return map;
  }, [deliveryDocs, sortedRecords]);

  const dealerRiskData = useMemo(() => {
    const grouped = new Map<string, { total: number; missing: number }>();
    sortedRecords.forEach((record) => {
      const dealer = (record.dealer ? String(record.dealer).trim() : "") || "Unknown";
      const current = grouped.get(dealer) || { total: 0, missing: 0 };
      current.total += 1;
      if (isMissingDeliveryDocAfter7Days(record, docsByChassis)) {
        current.missing += 1;
      }
      grouped.set(dealer, current);
    });

    const rows = Array.from(grouped.entries()).map(([dealer, value]) => ({
      dealer,
      total: value.total,
      missing: value.missing,
      percentage: value.total ? (value.missing / value.total) * 100 : 0,
    }));
    const maxPercent = Math.max(...rows.map((row) => row.percentage), 1);
    return rows
      .sort((a, b) => b.percentage - a.percentage)
      .map((row) => ({ ...row, height: Math.max((row.percentage / maxPercent) * 100, 6) }));
  }, [docsByChassis, sortedRecords]);

  const displayedRecords = useMemo(() => {
    if (selectedDealerRisk === "all") return sortedRecords;
    return sortedRecords.filter((record) => {
      const dealer = (record.dealer ? String(record.dealer).trim() : "") || "Unknown";
      return dealer === selectedDealerRisk && isMissingDeliveryDocAfter7Days(record, docsByChassis);
    });
  }, [docsByChassis, selectedDealerRisk, sortedRecords]);

  const selectedCount = useMemo(
    () => Object.values(selectedRows).filter(Boolean).length,
    [selectedRows]
  );

  const vendorEmailMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(transportCompanies || {}).forEach((company) => {
      const name = company.name?.trim();
      const email = company.email?.trim();
      if (name && email) {
        map.set(name, email);
      }
    });
    return map;
  }, [transportCompanies]);

  const resolveEmail = (record: PgiHistoryRow) => {
    if (recipientType === "dealer") {
      const dealer = record.dealer ? String(record.dealer).trim() : "";
      return dealerEmails[dealer] || "";
    }
    const vendor = record.vendorName ? String(record.vendorName).trim() : "";
    return vendorEmailMap.get(vendor) || "";
  };

  const renderTemplateMessage = (record: PgiHistoryRow) =>
    templateBody
      .replaceAll("{{chassis_number}}", record.chassisNumber || "")
      .replaceAll("{{pgi_date}}", String(record.pgidate || ""))
      .replaceAll("{{vendor_name}}", String(record.vendorName || ""));

  const sendSingleEmail = async (record: PgiHistoryRow) => {
    const toEmail = resolveEmail(record);
    if (!toEmail) {
      toast.error(`No ${recipientType} email found for this row.`);
      return;
    }

    await sendPgiMissingEmail({
      to_email: toEmail,
      to_name:
        recipientType === "dealer"
          ? String(record.dealer || "Dealer")
          : String(record.vendorName || "Vendor"),
      subject: templateSubject,
      message: renderTemplateMessage(record),
      chassis_number: record.chassisNumber || "",
      pgi_date: String(record.pgidate || ""),
      vendor_name: String(record.vendorName || ""),
      dealer_name: String(record.dealer || ""),
    });

    toast.success(`Email sent to ${toEmail}`);
  };

  const handleSendSelected = async () => {
    const selectedEntries = displayedRecords.filter(
      (record) => selectedRows[`${record.chassisNumber}-${record.entryId ?? "root"}`]
    );
    if (!selectedEntries.length) {
      toast.error("Please select at least one row.");
      return;
    }

    for (const record of selectedEntries) {
      // eslint-disable-next-line no-await-in-loop
      await sendSingleEmail(record);
    }
  };

  const handleDownload = () => {
    if (sortedRecords.length === 0) return;
    const headers = [
      "Chassis Number",
      "Dealer",
      "PGI Date",
      "PO Number",
      "Vendor Name",
      "PO Price",
      "GR Status",
      "GR Date",
      "Delivery Doc",
    ];
    const rows = displayedRecords.map((record) => {
      const docs = docsByChassis.get(record.chassisNumber) || [];
      return [
        record.chassisNumber || "",
        record.dealer || "",
        record.pgidate || "",
        record.poNumber || "",
        record.vendorName || "",
        record.poPrice != null ? String(record.poPrice) : "",
        record.grStatus || "",
        record.grDateLast || "",
        docs.map((doc) => doc.name).join("; "),
      ].map((value) => csvEscape(String(value)));
    });
    const csvContent = [headers.map(csvEscape).join(","), ...rows.map((row) => row.join(","))].join(
      "\n"
    );
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pgi-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">PGI History</CardTitle>
          <CardDescription>
            PGI records with delivery documents from Firebase storage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 pb-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Card className="border border-slate-200 bg-white/90 shadow-sm backdrop-blur">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">PGI Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold text-slate-900">{stats.totalPgi}</div>
                </CardContent>
              </Card>
              <Card className="border border-slate-200 bg-white/90 shadow-sm backdrop-blur">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">No GR</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold text-slate-900">{stats.noGrCount}</div>
                </CardContent>
              </Card>
              <Card className="border border-slate-200 bg-white/90 shadow-sm backdrop-blur">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Total Price</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold text-slate-900">
                    {formatPrice(stats.totalPrice)}
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-slate-200 bg-white/90 shadow-sm backdrop-blur">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">
                    Avg Transport Price
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold text-slate-900">
                    {formatPrice(stats.averagePrice)}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">Period</div>
                    <div className="text-xs text-slate-400">
                      {periodFilter === "custom" ? formatDateRange(customStart, customEnd) : "Preset"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={periodFilter === "pgi2026" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPeriodFilter("pgi2026")}
                    >
                      PGI 2026
                    </Button>
                    <Button
                      variant={periodFilter === "1m" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPeriodFilter("1m")}
                    >
                      1 Month
                    </Button>
                    <Button
                      variant={periodFilter === "3m" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPeriodFilter("3m")}
                    >
                      3 Months
                    </Button>
                    <Button
                      variant={periodFilter === "6m" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPeriodFilter("6m")}
                    >
                      6 Months
                    </Button>
                    <Button
                      variant={periodFilter === "custom" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPeriodFilter("custom")}
                    >
                      Custom
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 xl:col-span-2">
                    Chassis search
                    <input
                      type="search"
                      placeholder="Search chassis number"
                      className="h-10 rounded-md border border-input bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={chassisSearch}
                      onChange={(event) => setChassisSearch(event.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Vendor
                    <select
                      className="h-10 rounded-md border border-input bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={vendorFilter}
                      onChange={(event) => setVendorFilter(event.target.value)}
                    >
                      <option value="all">All vendors</option>
                      {vendorOptions.map((vendor) => (
                        <option key={vendor} value={vendor}>
                          {vendor}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Dealer
                    <select
                      className="h-10 rounded-md border border-input bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={dealerFilter}
                      onChange={(event) => setDealerFilter(event.target.value)}
                    >
                      <option value="all">All dealers</option>
                      {dealerOptions.map((dealer) => (
                        <option key={dealer} value={dealer}>
                          {dealer}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Start date
                    <input
                      type="date"
                      className="h-10 rounded-md border border-input bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={customStart}
                      onChange={(event) => {
                        setCustomStart(event.target.value);
                        setPeriodFilter("custom");
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    End date
                    <input
                      type="date"
                      className="h-10 rounded-md border border-input bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={customEnd}
                      onChange={(event) => {
                        setCustomEnd(event.target.value);
                        setPeriodFilter("custom");
                      }}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={statusFilter === "inTransit" ? "default" : "outline"}
                    onClick={() =>
                      setStatusFilter((prev) => (prev === "inTransit" ? "all" : "inTransit"))
                    }
                    className={
                      statusFilter === "inTransit"
                        ? "border-amber-300 bg-amber-100 text-amber-700 shadow-[0_0_8px_rgba(251,191,36,0.55)] hover:bg-amber-200"
                        : "border-amber-200 text-amber-700 hover:border-amber-300 hover:bg-amber-50"
                    }
                  >
                    In transit
                  </Button>
                  <Button
                    variant={statusFilter === "completed" ? "default" : "outline"}
                    onClick={() =>
                      setStatusFilter((prev) => (prev === "completed" ? "all" : "completed"))
                    }
                    className={
                      statusFilter === "completed"
                        ? "border-emerald-300 bg-emerald-100 text-emerald-700 shadow-[0_0_8px_rgba(34,197,94,0.45)] hover:bg-emerald-200"
                        : "border-emerald-200 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
                    }
                  >
                    Completed
                  </Button>
                  <Button
                    variant={statusFilter === "missingPo" ? "default" : "outline"}
                    onClick={() =>
                      setStatusFilter((prev) => (prev === "missingPo" ? "all" : "missingPo"))
                    }
                    className={
                      statusFilter === "missingPo"
                        ? "border-rose-300 bg-rose-100 text-rose-700 shadow-[0_0_8px_rgba(244,63,94,0.45)] hover:bg-rose-200"
                        : "border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50"
                    }
                  >
                    Missing PO
                  </Button>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                <label className="flex flex-col gap-2 text-xs font-medium text-slate-500">
                  Month
                  <select
                    className="h-10 w-[220px] rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                    disabled={monthOptions.length === 0}
                  >
                    <option value="all">All months</option>
                    {monthOptions.map((month) => (
                      <option key={month} value={month}>
                        {formatMonthLabel(month)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-xs text-slate-500">
                  Click dealer bar to filter missing Delivery Doc rows ({">7 days"}).
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 pb-2">
                    <div className="text-sm font-semibold text-slate-600">PGI Date Activity</div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      Total: {selectedMonthCount}
                    </span>
                  </div>
                  <div className="pb-3 text-xs text-slate-400">
                    {selectedMonth === "all"
                      ? "Daily counts by PGI date"
                      : `Daily counts in ${formatMonthLabel(selectedMonth)}`}
                  </div>
                  {selectedMonth === "all" || chartData.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No PGI date data for chart.</div>
                  ) : (
                    <div className="flex items-end gap-2 overflow-x-auto pb-1">
                      {chartData.map((bar) => (
                        <div key={bar.day} className="flex flex-col items-center gap-2">
                          <div
                            className="w-3 rounded-full bg-gradient-to-t from-blue-500 to-sky-300 shadow-[0_4px_10px_rgba(59,130,246,0.35)]"
                            style={{ height: `${bar.height}px` }}
                            title={`Day ${bar.day}: ${bar.count}`}
                          />
                          <span className="text-[10px] text-slate-400">{bar.day}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="text-sm font-semibold text-slate-600">
                      Dealer Missing Delivery Doc &gt;7 Days (%)
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedDealerRisk("all")}
                      disabled={selectedDealerRisk === "all"}
                    >
                      Clear filter
                    </Button>
                  </div>
                  {dealerRiskData.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No dealer risk data for current filters.</div>
                  ) : (
                    <div className="flex items-end gap-3 overflow-x-auto pb-1">
                      {dealerRiskData.map((bar) => (
                        <button
                          key={bar.dealer}
                          type="button"
                          onClick={() =>
                            setSelectedDealerRisk((prev) =>
                              prev === bar.dealer ? "all" : bar.dealer
                            )
                          }
                          className="flex min-w-[58px] flex-col items-center gap-2"
                        >
                          <div
                            className={`w-5 rounded-t-md ${
                              selectedDealerRisk === bar.dealer ? "bg-rose-600" : "bg-rose-400"
                            }`}
                            style={{ height: `${bar.height}px` }}
                            title={`${bar.dealer}: ${bar.percentage.toFixed(1)}%`}
                          />
                          <span className="max-w-[74px] truncate text-[10px] text-slate-500">{bar.dealer}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div className="text-sm text-slate-500">
              Showing {displayedRecords.length} PGI record{displayedRecords.length === 1 ? "" : "s"}
              {selectedDealerRisk !== "all" && ` (filtered: ${selectedDealerRisk})`}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                Download table CSV
              </Button>
              <Button
                variant={multipleEmailMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setMultipleEmailMode((prev) => !prev);
                  setSelectedRows({});
                }}
              >
                {multipleEmailMode ? "Cancel Multiple Email" : "Multiple Email"}
              </Button>
            </div>
          </div>
          {multipleEmailMode && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  displayedRecords.forEach((record) => {
                    if (!isMissingDeliveryDocAfter7Days(record, docsByChassis)) return;
                    next[`${record.chassisNumber}-${record.entryId ?? "root"}`] = true;
                  });
                  setSelectedRows(next);
                }}
              >
                Select all
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedRows({})}>
                Clear
              </Button>
              <select
                className="h-9 rounded-md border border-input bg-white px-3 text-sm"
                value={recipientType}
                onChange={(event) => setRecipientType(event.target.value as "dealer" | "vendor")}
              >
                <option value="dealer">Send to Dealer</option>
                <option value="vendor">Send to Vendor</option>
              </select>
              <Button size="sm" onClick={() => void handleSendSelected()}>
                Send selected ({selectedCount})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplateEditor((prev) => !prev)}
              >
                {showTemplateEditor ? "Hide Template" : "Edit Template"}
              </Button>
            </div>
          )}
          {showTemplateEditor && (
            <div className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Email Template</div>
              <input
                className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                placeholder="Subject"
                value={templateSubject}
                onChange={(event) => setTemplateSubject(event.target.value)}
              />
              <textarea
                className="min-h-[160px] w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                value={templateBody}
                onChange={(event) => setTemplateBody(event.target.value)}
              />
              <div className="text-xs text-slate-500">
                Required placeholders: {"{{chassis_number}}"}, {"{{pgi_date}}"}, {"{{vendor_name}}"}
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  if (
                    !templateBody.includes("{{chassis_number}}") ||
                    !templateBody.includes("{{pgi_date}}") ||
                    !templateBody.includes("{{vendor_name}}")
                  ) {
                    toast.error("Template must include chassis_number, pgi_date and vendor_name.");
                    return;
                  }
                  await handleSavePgiEmailTemplate({
                    subject: templateSubject,
                    body: templateBody,
                  });
                  toast.success("Template saved.");
                }}
              >
                Save template
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table className="min-w-full border-separate border-spacing-y-2">
              <TableHeader>
                <TableRow className="rounded-lg bg-slate-50 shadow-sm">
                  {multipleEmailMode && <TableHead className="rounded-l-lg w-10">Select</TableHead>}
                  <TableHead className={multipleEmailMode ? "" : "rounded-l-lg"}>Chassis Number</TableHead>
                  <TableHead>Dealer</TableHead>
                  <TableHead>PGI Date</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Vendor Name</TableHead>
                  <TableHead className="text-right">PO Price</TableHead>
                  <TableHead>GR Status</TableHead>
                  <TableHead>GR Date</TableHead>
                  <TableHead>Delivery Doc</TableHead>
                  <TableHead className="rounded-r-lg w-16">Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={multipleEmailMode ? 11 : 10} className="text-center text-sm text-muted-foreground">
                      No PGI records found for the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedRecords.map((record) => {
                    const docs = docsByChassis.get(record.chassisNumber) || [];
                    const status = getChassisStatus(record);
                    const rowKey = `${record.chassisNumber}-${record.entryId ?? "root"}`;
                    const missingAfter7Days = isMissingDeliveryDocAfter7Days(record, docsByChassis);
                    return (
                      <TableRow
                        key={rowKey}
                        className={`rounded-lg border border-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${missingAfter7Days ? "bg-rose-50" : "bg-white"}`}
                      >
                        {multipleEmailMode && (
                          <TableCell className="align-top">
                            {missingAfter7Days ? (
                              <input
                                type="checkbox"
                                checked={Boolean(selectedRows[rowKey])}
                                onChange={(event) =>
                                  setSelectedRows((prev) => ({ ...prev, [rowKey]: event.target.checked }))
                                }
                              />
                            ) : null}
                          </TableCell>
                        )}
                        <TableCell className={`${multipleEmailMode ? "" : "rounded-l-lg"} font-medium`}>
                          <div className="flex items-center gap-2">
                            <span>{record.chassisNumber || "-"}</span>
                            {status === "inTransit" && (
                              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 shadow-[0_0_8px_rgba(251,191,36,0.65)]">
                                In transit
                              </span>
                            )}
                            {status === "completed" && (
                              <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 shadow-[0_0_8px_rgba(34,197,94,0.55)]">
                                Completed
                              </span>
                            )}
                            {status === "missingPo" && (
                              <span className="rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 shadow-[0_0_8px_rgba(244,63,94,0.55)]">
                                Missing PO
                              </span>
                            )}
                            {missingAfter7Days && (
                              <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                Missing Delivery Doc &gt;7d
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{record.dealer || "-"}</TableCell>
                        <TableCell>{record.pgidate || "-"}</TableCell>
                        <TableCell>{record.poNumber || "-"}</TableCell>
                        <TableCell>{record.vendorName || "-"}</TableCell>
                        <TableCell className="text-right">{formatPrice(record.poPrice)}</TableCell>
                        <TableCell>{record.grStatus || "-"}</TableCell>
                        <TableCell>{record.grDateLast || "-"}</TableCell>
                        <TableCell>
                          {docs.length > 0 ? (
                            <div className="flex flex-col gap-2">
                              {docs.map((doc) => (
                                <Button
                                  key={doc.fullPath}
                                  variant="outline"
                                  size="sm"
                                  asChild
                                  className="justify-start"
                                >
                                  <a href={doc.url} target="_blank" rel="noreferrer">
                                    {doc.name}
                                  </a>
                                </Button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {isLoadingDocs ? "Loading..." : "No file"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="rounded-r-lg">
                          {missingAfter7Days ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void sendSingleEmail(record)}
                              aria-label={`Send email for ${record.chassisNumber}`}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PGIHistoryPage;
