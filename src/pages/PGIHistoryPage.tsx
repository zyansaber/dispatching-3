import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { subscribePgiRecords, storage } from "@/lib/firebase";
import { sendPgiMissingEmail } from "@/lib/emailjs";
import type { PgiRecordData, PgiRecordEntry } from "@/types";
import { getDownloadURL, listAll, ref as storageRef } from "firebase/storage";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { useDashboardContext } from "./Index";

type PgiHistoryRow = PgiRecordEntry & { chassisNumber: string; entryId?: string };
type DeliveryDoc = { name: string; url: string; fullPath: string };
type PeriodFilter = "pgi2026" | "1m" | "3m" | "6m" | "custom";
type RecipientType = "dealer" | "vendor";

const isRecordEntry = (value: unknown): value is PgiRecordEntry => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return ["dealer", "poNumber", "vendorName", "grStatus", "pgidate"].some((key) => key in candidate);
};

const flattenPgiRecords = (data: PgiRecordData) => {
  const rows: PgiHistoryRow[] = [];
  Object.entries(data || {}).forEach(([chassisNumber, entries]) => {
    if (isRecordEntry(entries)) return rows.push({ chassisNumber, ...entries });
    if (!entries || typeof entries !== "object") return;
    Object.entries(entries).forEach(([entryId, entry]) => {
      if (!isRecordEntry(entry)) return;
      rows.push({ chassisNumber, entryId, ...entry });
    });
  });
  return rows;
};

const parsePgiDate = (value?: string | null) => {
  if (!value) return null;
  const [day, month, year] = value.trim().split("/").map((part) => Number.parseInt(part, 10));
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isMissingDeliveryAfter7Days = (record: PgiHistoryRow, docsByChassis: Map<string, DeliveryDoc[]>) => {
  const pgiDate = parsePgiDate(record.pgidate ? String(record.pgidate) : "");
  if (!pgiDate) return false;
  const ageDays = (Date.now() - pgiDate.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 7) return false;
  const docs = docsByChassis.get(record.chassisNumber) || [];
  return docs.length === 0;
};

const PGIHistoryPage: React.FC = () => {
  const { transportCompanies, dealerEmails, pgiEmailTemplate, handleSavePgiEmailTemplate } = useDashboardContext();
  const [records, setRecords] = useState<PgiHistoryRow[]>([]);
  const [deliveryDocs, setDeliveryDocs] = useState<DeliveryDoc[]>([]);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("pgi2026");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [dealerFilter, setDealerFilter] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [customStart, setCustomStart] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().slice(0, 10));
  const [selectedDealerRisk, setSelectedDealerRisk] = useState<string>("all");
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [recipientType, setRecipientType] = useState<RecipientType>("dealer");
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateSubject, setTemplateSubject] = useState(pgiEmailTemplate?.subject || "Missing Delivery Document Follow-up");
  const [templateBody, setTemplateBody] = useState(
    pgiEmailTemplate?.body ||
      "Dear Team,\n\nThe following chassis is still missing Delivery Doc for more than 7 days after PGI.\n\nChassis Number: {{chassis_number}}\nPGI Date: {{pgi_date}}\nVendor Name: {{vendor_name}}\n\nPlease action urgently."
  );

  useEffect(() => {
    const unsubscribe = subscribePgiRecords((data: PgiRecordData) => setRecords(flattenPgiRecords(data)));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!pgiEmailTemplate) return;
    setTemplateSubject(pgiEmailTemplate.subject || "Missing Delivery Document Follow-up");
    setTemplateBody(pgiEmailTemplate.body || "");
  }, [pgiEmailTemplate]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await listAll(storageRef(storage, "deliverydoc"));
        const docs = await Promise.all(list.items.map(async (item) => ({ name: item.name, fullPath: item.fullPath, url: await getDownloadURL(item) })));
        if (mounted) setDeliveryDocs(docs);
      } catch {
        toast.error("Failed to load delivery docs");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const docsByChassis = useMemo(() => {
    const map = new Map<string, DeliveryDoc[]>();
    records.forEach((record) => {
      const matches = deliveryDocs.filter((doc) => doc.name.includes(record.chassisNumber));
      if (matches.length) map.set(record.chassisNumber, matches);
    });
    return map;
  }, [deliveryDocs, records]);

  const filteredRecords = useMemo(() => {
    const now = new Date();
    const source = records.filter((record) => {
      if (vendorFilter !== "all" && String(record.vendorName || "").trim() !== vendorFilter) return false;
      if (dealerFilter !== "all" && String(record.dealer || "").trim() !== dealerFilter) return false;
      const pgiDate = parsePgiDate(record.pgidate ? String(record.pgidate) : "");
      if (!pgiDate) return false;
      if (periodFilter === "pgi2026") return pgiDate.getFullYear() === 2026;
      if (periodFilter === "custom") {
        const start = customStart ? new Date(customStart) : null;
        const end = customEnd ? new Date(customEnd) : null;
        if (start && pgiDate < start) return false;
        if (end) {
          const eod = new Date(end);
          eod.setHours(23, 59, 59, 999);
          if (pgiDate > eod) return false;
        }
        return true;
      }
      const monthsBack = periodFilter === "1m" ? 1 : periodFilter === "3m" ? 3 : 6;
      return pgiDate >= new Date(now.getFullYear(), now.getMonth() - monthsBack, now.getDate());
    });
    const monthFiltered =
      selectedMonth === "all"
        ? source
        : source.filter((record) => {
            const date = parsePgiDate(record.pgidate ? String(record.pgidate) : "");
            if (!date) return false;
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === selectedMonth;
          });
    return monthFiltered.sort((a, b) => (parsePgiDate(String(b.pgidate))?.getTime() || 0) - (parsePgiDate(String(a.pgidate))?.getTime() || 0));
  }, [records, vendorFilter, dealerFilter, periodFilter, customStart, customEnd, selectedMonth]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    filteredRecords.forEach((record) => {
      const date = parsePgiDate(record.pgidate ? String(record.pgidate) : "");
      if (!date) return;
      months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [filteredRecords]);

  useEffect(() => {
    if (monthOptions.length && !monthOptions.includes(selectedMonth)) setSelectedMonth(monthOptions[0]);
  }, [monthOptions, selectedMonth]);

  const chartData = useMemo(() => {
    if (selectedMonth === "all") return [] as Array<{ day: number; count: number; height: number }>;
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr) - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const counts = Array.from({ length: daysInMonth }, () => 0);
    filteredRecords.forEach((record) => {
      const date = parsePgiDate(record.pgidate ? String(record.pgidate) : "");
      if (!date || date.getFullYear() !== year || date.getMonth() !== month) return;
      counts[date.getDate() - 1] += 1;
    });
    const max = Math.max(...counts, 1);
    return counts.map((count, index) => ({ day: index + 1, count, height: Math.max((count / max) * 100, 6) }));
  }, [filteredRecords, selectedMonth]);

  const dealerRiskData = useMemo(() => {
    const grouped = new Map<string, { total: number; missingAfter7Days: number }>();
    filteredRecords.forEach((record) => {
      const dealer = String(record.dealer || "Unknown").trim() || "Unknown";
      const current = grouped.get(dealer) || { total: 0, missingAfter7Days: 0 };
      current.total += 1;
      if (isMissingDeliveryAfter7Days(record, docsByChassis)) current.missingAfter7Days += 1;
      grouped.set(dealer, current);
    });
    const rows = Array.from(grouped.entries()).map(([dealer, value]) => ({
      dealer,
      ...value,
      percentage: value.total ? (value.missingAfter7Days / value.total) * 100 : 0,
    }));
    const max = Math.max(...rows.map((r) => r.percentage), 1);
    return rows
      .sort((a, b) => b.percentage - a.percentage)
      .map((r) => ({ ...r, height: Math.max((r.percentage / max) * 100, 6) }));
  }, [docsByChassis, filteredRecords]);

  const displayedRecords = useMemo(() => {
    let rows = filteredRecords;
    if (selectedDealerRisk !== "all") {
      rows = rows.filter((r) => String(r.dealer || "Unknown").trim() === selectedDealerRisk);
    }
    return rows.filter((r) => !selectedDealerRisk || selectedDealerRisk === "all" || isMissingDeliveryAfter7Days(r, docsByChassis));
  }, [filteredRecords, selectedDealerRisk, docsByChassis]);

  const vendorEmailMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(transportCompanies || {}).forEach((company) => {
      if (company.name && company.email) map.set(company.name.trim(), company.email.trim());
    });
    return map;
  }, [transportCompanies]);

  const resolveRecipientEmail = (row: PgiHistoryRow) => {
    if (recipientType === "dealer") return dealerEmails[String(row.dealer || "").trim()] || "";
    return vendorEmailMap.get(String(row.vendorName || "").trim()) || "";
  };

  const renderTemplate = (row: PgiHistoryRow) =>
    templateBody
      .replaceAll("{{chassis_number}}", row.chassisNumber || "")
      .replaceAll("{{pgi_date}}", String(row.pgidate || ""))
      .replaceAll("{{vendor_name}}", String(row.vendorName || ""));

  const sendOne = async (row: PgiHistoryRow) => {
    const toEmail = resolveRecipientEmail(row);
    if (!toEmail) return toast.error(`No ${recipientType} email for ${recipientType === "dealer" ? row.dealer : row.vendorName}`);
    await sendPgiMissingEmail({
      to_email: toEmail,
      to_name: recipientType === "dealer" ? String(row.dealer || "") : String(row.vendorName || ""),
      subject: templateSubject,
      message: renderTemplate(row),
      chassis_number: row.chassisNumber,
      pgi_date: String(row.pgidate || ""),
      vendor_name: String(row.vendorName || ""),
      dealer_name: String(row.dealer || ""),
    });
    toast.success(`Email sent to ${toEmail}`);
  };

  const selectedRowsData = displayedRecords.filter((row) => selectedRows[`${row.chassisNumber}-${row.entryId || "root"}`]);

  const sendBulk = async () => {
    if (!selectedRowsData.length) return;
    for (const row of selectedRowsData) {
      // eslint-disable-next-line no-await-in-loop
      await sendOne(row);
    }
  };

  const vendors = Array.from(new Set(records.map((r) => String(r.vendorName || "").trim()).filter(Boolean))).sort();
  const dealers = Array.from(new Set(records.map((r) => String(r.dealer || "").trim()).filter(Boolean))).sort();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">PGI History</CardTitle>
          <CardDescription>Track PGI, missing delivery docs, and notify dealers/vendors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["pgi2026", "1m", "3m", "6m", "custom"] as PeriodFilter[]).map((p) => (
              <Button key={p} size="sm" variant={periodFilter === p ? "default" : "outline"} onClick={() => setPeriodFilter(p)}>{p.toUpperCase()}</Button>
            ))}
            <select className="h-9 rounded-md border px-2" value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
              <option value="all">All vendors</option>
              {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="h-9 rounded-md border px-2" value={dealerFilter} onChange={(e) => setDealerFilter(e.target.value)}>
              <option value="all">All dealers</option>
              {dealers.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="h-9 rounded-md border px-2" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
              <option value="all">All months</option>
              {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {periodFilter === "custom" && (
              <>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-40" />
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-40" />
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4">
              <div className="mb-3 text-sm font-semibold">PGI Date Activity</div>
              <div className="flex min-h-[140px] items-end gap-2 overflow-x-auto">
                {chartData.map((bar) => (
                  <div key={bar.day} className="flex flex-col items-center gap-1">
                    <div className="w-3 rounded bg-blue-500" style={{ height: `${bar.height}px` }} title={`Day ${bar.day}: ${bar.count}`} />
                    <span className="text-[10px] text-slate-500">{bar.day}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="mb-3 text-sm font-semibold">Dealer Missing Delivery Doc &gt;7 Days (%)</div>
              <div className="flex min-h-[140px] items-end gap-3 overflow-x-auto">
                {dealerRiskData.map((bar) => (
                  <button key={bar.dealer} className={`flex min-w-[52px] flex-col items-center gap-1 ${selectedDealerRisk === bar.dealer ? "opacity-100" : "opacity-80"}`} onClick={() => setSelectedDealerRisk((prev) => (prev === bar.dealer ? "all" : bar.dealer))}>
                    <div className="w-5 rounded bg-rose-500" style={{ height: `${bar.height}px` }} title={`${bar.dealer}: ${bar.percentage.toFixed(1)}%`} />
                    <span className="max-w-[72px] truncate text-[10px]">{bar.dealer}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                const next: Record<string, boolean> = {};
                displayedRecords.forEach((r) => { next[`${r.chassisNumber}-${r.entryId || "root"}`] = true; });
                setSelectedRows(next);
              }}>Select all</Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedRows({})}>Clear</Button>
              <select className="h-9 rounded-md border px-2" value={recipientType} onChange={(e) => setRecipientType(e.target.value as RecipientType)}>
                <option value="dealer">Send to Dealer</option>
                <option value="vendor">Send to Vendor</option>
              </select>
              <Button size="sm" onClick={sendBulk}>Send selected</Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowTemplateEditor((prev) => !prev)}>
              {showTemplateEditor ? "Close template editor" : "Edit email template"}
            </Button>
          </div>

          {showTemplateEditor && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="text-sm font-semibold">PGI Missing Doc Email Template</div>
              <div className="text-sm font-medium">Subject</div>
              <Input value={templateSubject} onChange={(e) => setTemplateSubject(e.target.value)} />
              <div className="text-sm font-medium">Body (must include placeholders)</div>
              <Textarea rows={12} value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} />
              <div className="text-xs text-slate-500">Use placeholders: {"{{chassis_number}}"}, {"{{pgi_date}}"}, {"{{vendor_name}}"}</div>
              <Button onClick={async () => {
                if (!templateBody.includes("{{chassis_number}}") || !templateBody.includes("{{pgi_date}}") || !templateBody.includes("{{vendor_name}}")) {
                  toast.error("Template must include Chassis Number, PGI Date and Vendor Name placeholders");
                  return;
                }
                await handleSavePgiEmailTemplate({ subject: templateSubject, body: templateBody });
                toast.success("Template saved to Firebase");
              }}>Save template</Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Chassis</TableHead>
                <TableHead>Dealer</TableHead>
                <TableHead>PGI Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Delivery Doc</TableHead>
                <TableHead className="w-16">Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedRecords.map((row) => {
                const key = `${row.chassisNumber}-${row.entryId || "root"}`;
                const docs = docsByChassis.get(row.chassisNumber) || [];
                const missing = isMissingDeliveryAfter7Days(row, docsByChassis);
                return (
                  <TableRow key={key} className={missing ? "bg-rose-50/70" : ""}>
                    <TableCell>
                      <input type="checkbox" checked={Boolean(selectedRows[key])} onChange={(event) => setSelectedRows((prev) => ({ ...prev, [key]: event.target.checked }))} />
                    </TableCell>
                    <TableCell>{row.chassisNumber}</TableCell>
                    <TableCell>{row.dealer || "-"}</TableCell>
                    <TableCell>{row.pgidate || "-"}</TableCell>
                    <TableCell>{row.vendorName || "-"}</TableCell>
                    <TableCell>{docs.length ? docs.map((d) => d.name).join(", ") : "Missing"}</TableCell>
                    <TableCell>
                      {missing && (
                        <Button size="icon" variant="ghost" onClick={() => void sendOne(row)}>
                          <Mail className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PGIHistoryPage;
