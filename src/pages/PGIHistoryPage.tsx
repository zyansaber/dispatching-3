import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { subscribePgiRecords, storage } from "@/lib/firebase";
import type { PgiRecordData, PgiRecordEntry } from "@/types";
import { getDownloadURL, listAll, ref as storageRef } from "firebase/storage";

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

const PGIHistoryPage: React.FC = () => {
  const [records, setRecords] = useState<PgiHistoryRow[]>([]);
  const [deliveryDocs, setDeliveryDocs] = useState<DeliveryDoc[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(true);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("pgi2026");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [dealerFilter, setDealerFilter] = useState<string>("all");
  const [onlyNoGr, setOnlyNoGr] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [customStart, setCustomStart] = useState<string>(() =>
    formatDateInput(new Date(new Date().getFullYear(), 0, 1))
  );
  const [customEnd, setCustomEnd] = useState<string>(() =>
    formatDateInput(new Date())
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
    onlyNoGr,
    periodFilter,
    records,
    statusFilter,
    vendorFilter,
  ]);

  const sortedRecords = useMemo(() => {
    const items = [...filteredRecords];
    items.sort((a, b) => {
      const dateA = parsePgiDate(a.pgidate ? String(a.pgidate) : "")?.getTime() ?? 0;
      const dateB = parsePgiDate(b.pgidate ? String(b.pgidate) : "")?.getTime() ?? 0;
      if (dateA !== dateB) return dateB - dateA;
      return (a.chassisNumber || "").localeCompare(b.chassisNumber || "");
    });
    return items;
  }, [filteredRecords]);

  const stats = useMemo(() => {
    const noGrCount = filteredRecords.filter((record) =>
      isNoGrStatus(record.grStatus ? String(record.grStatus) : "")
    ).length;
    const prices = filteredRecords
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
      noGrCount,
      totalPrice,
      averagePrice,
    };
  }, [filteredRecords]);

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
            <div className="grid gap-3 md:grid-cols-3">
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                <div>
                  <div className="text-sm font-semibold text-slate-600">PGI Date Activity</div>
                  <div className="text-xs text-slate-400">Daily counts by PGI date</div>
                </div>
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
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-full border-separate border-spacing-y-2">
              <TableHeader>
                <TableRow className="rounded-lg bg-slate-50 shadow-sm">
                  <TableHead className="rounded-l-lg">Chassis Number</TableHead>
                  <TableHead>Dealer</TableHead>
                  <TableHead>PGI Date</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Vendor Name</TableHead>
                  <TableHead className="text-right">PO Price</TableHead>
                  <TableHead>GR Status</TableHead>
                  <TableHead>GR Date</TableHead>
                  <TableHead className="rounded-r-lg">Delivery Doc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                      No PGI records found for the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRecords.map((record) => {
                    const docs = docsByChassis.get(record.chassisNumber) || [];
                    const status = getChassisStatus(record);
                    return (
                      <TableRow
                        key={`${record.chassisNumber}-${record.entryId ?? "root"}`}
                        className="rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <TableCell className="rounded-l-lg font-medium">
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
                          </div>
                        </TableCell>
                        <TableCell>{record.dealer || "-"}</TableCell>
                        <TableCell>{record.pgidate || "-"}</TableCell>
                        <TableCell>{record.poNumber || "-"}</TableCell>
                        <TableCell>{record.vendorName || "-"}</TableCell>
                        <TableCell className="text-right">{formatPrice(record.poPrice)}</TableCell>
                        <TableCell>{record.grStatus || "-"}</TableCell>
                        <TableCell>{record.grDateLast || "-"}</TableCell>
                        <TableCell className="rounded-r-lg">
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
