// src/components/DataTables.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, AlertTriangle, Mail, Download, RotateCw } from "lucide-react";
import { ProcessedDispatchEntry, ProcessedReallocationEntry, TransportConfig } from "@/types";
import {
  getGRDaysColor,
  getGRDaysWidth,
  getStatusCheckCategory,
  getStatusCheckLabel,
  reportError,
  patchDispatch,
} from "@/lib/firebase";
import { toast } from "sonner";
import type { SidebarFilter } from "@/pages/Index";

// XLSX（CDN 注入）
declare global { interface Window { XLSX?: any } }

// 统一样式
const CELL = "text-sm leading-5 whitespace-nowrap overflow-hidden text-ellipsis";
const CELL_VDIV = "border-r border-slate-200 last:border-r-0"; // 竖向浅分隔

// 列宽（避免左右滚动）
const COLS = [
  { key: "__bar",            w: 8   },
  { key: "Chassis No",       w: 160 },
  { key: "GR to GI Days",    w: 90  },
  { key: "Customer",         w: 160 },
  { key: "Model",            w: 120 },
  { key: "SAP Data",         w: 170 },
  { key: "Scheduled Dealer", w: 170 },
  { key: "Matched PO No",    w: 170 },
  { key: "Transport",        w: 180 },
  { key: "Status",           w: 110 },
];

// 邮件（可选）
type EmailModule = typeof import("@/lib/emailjs");
let emailModulePromise: Promise<EmailModule> | null = null;
const loadEmailModule = () => {
  if (!emailModulePromise) {
    emailModulePromise = import("@/lib/emailjs");
  }
  return emailModulePromise;
};

/* ====================== 顶部统计卡片 ====================== */
interface DispatchStatsProps {
  total: number;
  wrongStatus: number;
  noReference: number;
  snowyStock: number;
  canBeDispatched: number;
  booked?: number;
  onHold?: number;
  temporaryLeavingWithoutPGI?: number;
  onFilterChange: (filter: 'all' | 'wrongStatus' | 'noReference' | 'snowy' | 'canBeDispatched' | 'onHold' | 'booked' | 'temporaryLeaving') => void;
  activeFilter?: 'all' | 'wrongStatus' | 'noReference' | 'snowy' | 'canBeDispatched' | 'onHold' | 'booked' | 'temporaryLeaving';
  onRefresh: () => void;
  refreshing?: boolean;
}

export const DispatchStats: React.FC<DispatchStatsProps> = ({
  total, wrongStatus, noReference, snowyStock, canBeDispatched, onHold, booked,
  temporaryLeavingWithoutPGI, onFilterChange, activeFilter = "all", onRefresh, refreshing = false,
}) => {
  const waitingForBooking = canBeDispatched + wrongStatus + noReference;
  const topCards = [
    { label: "Ready for dispatch", value: canBeDispatched, filter: "canBeDispatched" },
    { label: "Total", value: total, filter: "all" },
    { label: "Snowy Stock", value: snowyStock, filter: "snowy" },
    { label: "Waiting for booking transport", value: waitingForBooking, filter: "canBeDispatched" },
    ...(booked !== undefined ? [{ label: "Booked", value: booked, filter: "booked" } as const] : []),
  ] as const;
  const otherCards = [
    ...(onHold !== undefined ? [{ label: "On Hold", value: onHold, filter: "onHold" } as const] : []),
    ...(temporaryLeavingWithoutPGI !== undefined
      ? [
          {
            label: "Temporary Leaving without PGI",
            value: temporaryLeavingWithoutPGI,
            filter: "temporaryLeaving",
          } as const,
        ]
      : []),
  ] as const;
  const dataIssueCards = [
    {
      label: "Not found in the planning schedule",
      value: noReference,
      filter: "noReference",
      className: "border-amber-200 bg-amber-50/70",
    },
    {
      label: "Wrong status in CMS",
      value: wrongStatus,
      filter: "wrongStatus",
      className: "border-rose-200 bg-rose-50/60",
    },
  ] as const;

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {topCards.map((card) => (
            <Card
              key={card.filter}
              className={`cursor-pointer transition hover:shadow-sm ${activeFilter === card.filter ? "ring-2 ring-blue-500" : ""}`}
              onClick={() => onFilterChange(card.filter as any)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-[13px] font-medium text-slate-600 truncate">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-slate-900">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={onRefresh} disabled={refreshing}>
          <RotateCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          Other
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-3xl">
          {otherCards.map((card) => (
            <Card
              key={card.label}
              className={`cursor-pointer border transition hover:shadow-sm ${
                activeFilter === card.filter ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => onFilterChange(card.filter as any)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-[13px] font-medium text-slate-600 truncate">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-slate-900">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          Data issue
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-3xl">
          {dataIssueCards.map((card) => (
            <Card
              key={card.filter}
              className={`cursor-pointer border transition hover:shadow-sm ${card.className} ${
                activeFilter === card.filter ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => onFilterChange(card.filter as any)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-[13px] font-medium text-slate-600 truncate">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-slate-900">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ====================== 主表 ====================== */
interface DispatchTableProps {
  allData: ProcessedDispatchEntry[];
  activeFilter?: 'all' | 'wrongStatus' | 'noReference' | 'snowy' | 'canBeDispatched' | 'onHold' | 'booked' | 'temporaryLeaving';
  searchTerm: string;
  onSearchChange: (term: string) => void;
  reallocationData: ProcessedReallocationEntry[];
  transportCompanies?: TransportConfig;
  grRangeFilter?: SidebarFilter | null;
}

export const DispatchTable: React.FC<DispatchTableProps> = ({
  allData,
  activeFilter = "all",
  searchTerm,
  onSearchChange,
  reallocationData,
  transportCompanies = {},
  grRangeFilter = null,
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc'; } | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  // 行内编辑
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [pickupDraft, setPickupDraft]   = useState<Record<string, string>>({});

  // 乐观
  const [optimistic, setOptimistic]     = useState<Record<string, Partial<ProcessedDispatchEntry>>>({});
  const [saving, setSaving]             = useState<Record<string, boolean>>({});
  const [error, setError]               = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!allData?.length) return;
    setOptimistic((cur) => {
      const next = { ...cur };
      for (const id of Object.keys(cur)) {
        const base = allData.find(e => getRowKey(e) === id);
        if (!base) continue;
        const p = cur[id];
        const inSync =
          (p.OnHold === undefined || p.OnHold === base.OnHold) &&
          (p.Comment === undefined || p.Comment === base.Comment) &&
          (p.EstimatedPickupAt === undefined || p.EstimatedPickupAt === base.EstimatedPickupAt) &&
          (p.TemporaryLeavingWithoutPGI === undefined ||
            p.TemporaryLeavingWithoutPGI === base.TemporaryLeavingWithoutPGI) &&
          (p.TemporaryLeavingWithoutPGIAt === undefined ||
            p.TemporaryLeavingWithoutPGIAt === base.TemporaryLeavingWithoutPGIAt) &&
          (p.TemporaryLeavingWithoutPGIBy === undefined ||
            p.TemporaryLeavingWithoutPGIBy === base.TemporaryLeavingWithoutPGIBy);
        if (inSync) delete next[id];
      }
      return next;
    });
  }, [allData]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const safeIncludes = (v: any, s: string) => v != null && String(v).toLowerCase().includes(s);
  const getRowKey = (row: ProcessedDispatchEntry) => row.dispatchKey ?? row["Chassis No"] ?? "";

  // 合并乐观层
  const baseMerged = useMemo(() => {
    const map: Record<string, ProcessedDispatchEntry> = {};
    for (const e of allData) {
      const key = getRowKey(e);
      map[key] = { ...e, ...(optimistic[key] || {}) };
    }
    return Object.values(map);
  }, [allData, optimistic]);

  const filtered = useMemo(() => {
    const s = (searchTerm || "").toLowerCase();
    let arr = baseMerged;
    if (activeFilter === "wrongStatus")
      arr = arr.filter(
        (e) => getStatusCheckCategory(e.Statuscheck) === "wrongStatus"
      );
    if (activeFilter === "noReference")
      arr = arr.filter(
        (e) => getStatusCheckCategory(e.Statuscheck) === "noReference"
      );
    if (activeFilter === "onHold")    arr = arr.filter(e => e.OnHold === true);
    if (activeFilter === "temporaryLeaving") arr = arr.filter(e => e.TemporaryLeavingWithoutPGI === true);
    if (activeFilter === "booked")    arr = arr.filter(e => {
      const poNo = e["Matched PO No"];
      return typeof poNo === "string" ? poNo.trim().length > 0 : Boolean(poNo);
    });
    if (activeFilter === "snowy")     arr = arr.filter(e => e.reallocatedTo === "Snowy Stock" || e["Scheduled Dealer"] === "Snowy Stock");
    if (activeFilter === "canBeDispatched")
      arr = arr.filter(
        (e) =>
          (e.Statuscheck === "OK" ||
            getStatusCheckCategory(e.Statuscheck) === "wrongStatus" ||
            getStatusCheckCategory(e.Statuscheck) === "noReference") &&
          !e.OnHold &&
          !e.TemporaryLeavingWithoutPGI &&
          !(e.reallocatedTo === "Snowy Stock" || e["Scheduled Dealer"] === "Snowy Stock")
      );

    if (grRangeFilter?.kind === "grRange") {
      arr = arr.filter((e) => {
        const days = Number(e["GR to GI Days"] ?? 0) || 0;
        const meetsMin = days >= grRangeFilter.min;
        const meetsMax = grRangeFilter.max == null ? true : days <= grRangeFilter.max;
        return meetsMin && meetsMax;
      });
    }

    if (s) {
      arr = arr.filter(entry => {
        const d = entry;
        const reMatch = reallocationData.some(re =>
          re.chassisNumber === d["Chassis No"] &&
          (safeIncludes(re.customer, s) || safeIncludes(re.model, s) || safeIncludes(re.reallocatedTo, s) || safeIncludes(re.issue?.type, s))
        );
        return (
          safeIncludes(d["Chassis No"], s) ||
          safeIncludes(d.Customer, s) ||
          safeIncludes(d.Model, s) ||
          safeIncludes(d["Matched PO No"], s) ||
          safeIncludes(d["SAP Data"], s) ||
          safeIncludes(d["Scheduled Dealer"], s) ||
          safeIncludes(d.TransportCompany, s) ||
          safeIncludes(d.TransportDealer, s) ||
          safeIncludes(d.Statuscheck, s) ||
          safeIncludes(getStatusCheckLabel(d.Statuscheck), s) ||
          safeIncludes(d.DealerCheck, s) ||
          safeIncludes(d.reallocatedTo, s) ||
          safeIncludes(d.Comment, s) ||
          safeIncludes(d.EstimatedPickupAt, s) ||
          reMatch
        );
      });
    }

    if (sortConfig) {
      const { key, direction } = sortConfig;
      arr = [...arr].sort((a: any, b: any) => {
        const av = a[key], bv = b[key];
        if (key === "GR to GI Days") {
          return direction === 'asc' ? (Number(av)||0) - (Number(bv)||0) : (Number(bv)||0) - (Number(av)||0);
        }
        return direction === 'asc'
          ? String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: "base" })
          : String(bv ?? '').localeCompare(String(av ?? ''), undefined, { sensitivity: "base" });
      });
    }
    return arr;
  }, [baseMerged, searchTerm, activeFilter, sortConfig, reallocationData, grRangeFilter]);

  const activeRows = filtered.filter(e => !e.OnHold && !e.TemporaryLeavingWithoutPGI);
  const onHoldRows = filtered.filter(e =>  e.OnHold);
  const temporaryLeavingRows = filtered.filter(e => e.TemporaryLeavingWithoutPGI);

  const maxGRDays = Math.max(...baseMerged.map(e => e["GR to GI Days"] || 0), 1);

  // 日期
  const isoToLocal = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const localToIso = (v: string) => (v ? new Date(v).toISOString() : null);
  const minLocalNow = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }, []);

  // 乐观写库
  const applyOptimistic = (id: string, patch: Partial<ProcessedDispatchEntry>) =>
    setOptimistic((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));

  const handleToggleOnHold = async (row: ProcessedDispatchEntry, next: boolean) => {
    const id = getRowKey(row);
    const patch = {
      OnHold: next,
      OnHoldAt: next ? new Date().toISOString() : null,
      OnHoldBy: next ? ("webapp" as const) : null,
      ...(next
        ? {
            TemporaryLeavingWithoutPGI: false,
            TemporaryLeavingWithoutPGIAt: null,
            TemporaryLeavingWithoutPGIBy: null,
          }
        : {}),
    };
    applyOptimistic(id, patch);
    setSaving(s => ({ ...s, [id]: true }));
    setError(e => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, patch);
    } catch (err: any) {
      setOptimistic(m => {
        const prev = { ...(m[id] || {}) };
        delete prev.OnHold;
        delete prev.OnHoldAt;
        delete prev.OnHoldBy;
        delete prev.TemporaryLeavingWithoutPGI;
        delete prev.TemporaryLeavingWithoutPGIAt;
        delete prev.TemporaryLeavingWithoutPGIBy;
        return { ...m, [id]: prev };
      });
      setError(e => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const handleToggleTemporaryLeaving = async (row: ProcessedDispatchEntry, next: boolean) => {
    const id = getRowKey(row);
    let comment = row.Comment ?? "";
    if (next) {
      const promptValue = window.prompt(
        "Please enter a comment for temporary leaving without PGI.",
        comment
      );
      if (promptValue == null) return;
      comment = promptValue.trim();
      if (!comment) {
        toast.error("Comment is required for temporary leaving without PGI.");
        return;
      }
    }
    const patch: Partial<ProcessedDispatchEntry> = {
      TemporaryLeavingWithoutPGI: next,
      TemporaryLeavingWithoutPGIAt: next ? new Date().toISOString() : null,
      TemporaryLeavingWithoutPGIBy: next ? ("webapp" as const) : null,
      ...(next ? { Comment: comment } : {}),
      ...(next
        ? {
            OnHold: false,
            OnHoldAt: null,
            OnHoldBy: null,
          }
        : {}),
    };
    applyOptimistic(id, patch);
    setSaving((s) => ({ ...s, [id]: true }));
    setError((e) => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, patch);
    } catch (err: any) {
      setOptimistic((m) => {
        const prev = { ...(m[id] || {}) };
        delete prev.TemporaryLeavingWithoutPGI;
        delete prev.TemporaryLeavingWithoutPGIAt;
        delete prev.TemporaryLeavingWithoutPGIBy;
        if (next) delete prev.Comment;
        return { ...m, [id]: prev };
      });
      setError((e) => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const handleSaveComment = async (row: ProcessedDispatchEntry) => {
    const id = getRowKey(row);
    const value = commentDraft[id] ?? row.Comment ?? "";
    applyOptimistic(id, { Comment: value });
    setSaving(s => ({ ...s, [id]: true }));
    setError(e => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, { Comment: value });
    } catch (err: any) {
      setOptimistic(m => { const p = { ...(m[id] || {}) }; delete p.Comment; return { ...m, [id]: p }; });
      setError(e => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const handleSavePickup = async (row: ProcessedDispatchEntry) => {
    const id = getRowKey(row);
    const localVal = pickupDraft[id] ?? isoToLocal(row.EstimatedPickupAt);
    if (localVal) {
      const picked = new Date(localVal);
      if (picked < new Date()) {
        setError(e => ({ ...e, [id]: "Pick-up time must be today or later" }));
        return;
      }
    }
    const iso = localVal ? localToIso(localVal) : null;
    applyOptimistic(id, { EstimatedPickupAt: iso });
    setSaving(s => ({ ...s, [id]: true }));
    setError(e => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, { EstimatedPickupAt: iso });
    } catch (err: any) {
      setOptimistic(m => { const p = { ...(m[id] || {}) }; delete p.EstimatedPickupAt; return { ...m, [id]: p }; });
      setError(e => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const handleSaveTransport = async (
    row: ProcessedDispatchEntry,
    company: string | null,
    dealer?: string | null
  ) => {
    const id = getRowKey(row);
    const patch: Partial<ProcessedDispatchEntry> = {
      TransportCompany: company,
      TransportDealer: dealer === undefined ? row.TransportDealer || null : dealer,
    };
    // Reset dealer if company changed
    if (company !== row.TransportCompany) {
      patch.TransportDealer = null;
    }

    applyOptimistic(id, patch);
    setSaving((s) => ({ ...s, [id]: true }));
    setError((e) => ({ ...e, [id]: undefined }));
    try {
      await patchDispatch(id, patch);
    } catch (err: any) {
      setOptimistic((m) => {
        const prev = { ...(m[id] || {}) };
        delete prev.TransportCompany;
        delete prev.TransportDealer;
        return { ...m, [id]: prev };
      });
      setError((e) => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const handleReportError = async (entry: ProcessedDispatchEntry) => {
    const chassisNo = entry["Chassis No"] || entry.dispatchKey || "";
    if (!chassisNo) return;
    setSendingEmail(chassisNo);
    try {
           const emailModule = await loadEmailModule();
      try {
        await emailModule.sendReportEmail({
          chassisNo,
          sapData: entry["SAP Data"],
          scheduledDealer: entry["Scheduled Dealer"],
          reallocatedTo: entry.reallocatedTo,
          customer: entry.Customer,
          model: entry.Model,
          statusCheck: entry.Statuscheck,
          dealerCheck: entry.DealerCheck,
          grDays: entry["GR to GI Days"],
        });
        toast.success(`Report sent for ${chassisNo}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : null;
        toast.error(message ? `Failed to send email report: ${message}` : "Failed to send email report.");
      }
      try {
        await reportError(chassisNo, "Dealer check mismatch");
      } catch (error) {
        const message = error instanceof Error ? error.message : null;
        toast.error(message ? `Failed to record report: ${message}` : "Failed to record report.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : null;
      toast.error(message ? `Failed to initialise email reporting: ${message}` : "Failed to send report.");
    } finally {
      setSendingEmail(null);
    }
  };

  // 导出
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const toPlainRow = (e: ProcessedDispatchEntry) => ({
    "Chassis No": e["Chassis No"],
    "GR to GI Days": e["GR to GI Days"] ?? "",
    Customer: e.Customer ?? "",
    Model: e.Model ?? "",
    "SAP Data": e["SAP Data"] ?? "",
    "Scheduled Dealer": e["Scheduled Dealer"] ?? "",
    "Matched PO No": e["Matched PO No"] ?? "",
    "Transport Company": e.TransportCompany ?? "",
    "Transport Dealer": e.TransportDealer ?? "",
    "On Hold": e.OnHold ? "Yes" : "No",
    "Temporary Leaving without PGI": e.TemporaryLeavingWithoutPGI ? "Yes" : "No",
    Status: getStatusCheckLabel(e.Statuscheck),
    Dealer: e.DealerCheck ?? "",
    Reallocation: e.reallocatedTo ?? "",
    Comment: e.Comment ?? "",
    "Estimated Pickup At": e.EstimatedPickupAt ?? "",
  });

  const transportOptions = useMemo(() =>
    Object.values(transportCompanies || {}).map((c) => ({
      name: c.name,
      dealers: c.dealers || [],
    })),
  [transportCompanies]);

  const findCompanyByName = (name?: string | null) =>
    transportOptions.find((c) => c.name === name);

  const loadXLSX = (): Promise<any> => new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js";
    s.async = true;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error("CDN xlsx load failed"));
    document.head.appendChild(s);
  });

  const exportExcel = async () => {
    try {
      const XLSX = await loadXLSX();
      const active = activeRows.map(toPlainRow);
      const onhold = onHoldRows.map(toPlainRow);

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(active);
      const ws2 = XLSX.utils.json_to_sheet(onhold);
      XLSX.utils.book_append_sheet(wb, ws1, "Active");
      XLSX.utils.book_append_sheet(wb, ws2, "On Hold");

      const wbout = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      downloadBlob(new Blob([wbout], { type: "application/octet-stream" }), `dispatch_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast.success("Excel 导出完成");
    } catch {
      const rowsToCsv = (rows: any[]) => {
        if (!rows.length) return "";
        const headers = Object.keys(rows[0]);
        const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [headers.map(escape).join(",")];
        for (const r of rows) lines.push(headers.map(h => escape(r[h])).join(","));
        return lines.join("\n");
      };
      const active = activeRows.map(toPlainRow);
      const onhold = onHoldRows.map(toPlainRow);
      downloadBlob(new Blob([rowsToCsv(active)], { type: "text/csv;charset=utf-8" }), `dispatch_active_${new Date().toISOString().slice(0,10)}.csv`);
      downloadBlob(new Blob([rowsToCsv(onhold)], { type: "text/csv;charset=utf-8" }), `dispatch_onhold_${new Date().toISOString().slice(0,10)}.csv`);
      toast.message("Excel 依赖不可用，已回落为 CSV 导出");
    }
  };

  const SortableHeader = ({ children, sortKey, className = "", align = "left" as "left" | "center" }: { children: React.ReactNode; sortKey: string; className?: string; align?: "left" | "center" }) => (
    <TableHead
      className={`cursor-pointer hover:bg-slate-50 transition-colors align-top ${CELL_VDIV} ${align === "center" ? "text-center" : ""} ${className}`}
      onClick={() => handleSort(sortKey)}
    >
      <div className={`flex ${align === "center" ? "justify-center" : ""} items-center gap-1`}>
        <span className="truncate font-medium text-slate-800">{children}</span>
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </div>
    </TableHead>
  );

  // ✅ 迷你表头：每个车架号块上方都显示（淡色、对齐一致）
  const MiniHeaderRow: React.FC = () => (
    <TableRow className="bg-slate-50/80">
      {/* 左侧色条占位 */}
      <TableCell className="p-0" />
      <TableCell className={`py-2 text-[11px] font-medium text-slate-500 ${CELL_VDIV}`}>Chassis</TableCell>
      <TableCell className={`py-2 text-[11px] font-medium text-slate-500 text-center ${CELL_VDIV}`}>GR Days</TableCell>
      <TableCell className={`py-2 text-[11px] font-medium text-slate-500 ${CELL_VDIV}`}>Customer</TableCell>
      <TableCell className={`py-2 text-[11px] font-medium text-slate-500 ${CELL_VDIV}`}>Model</TableCell>
      <TableCell className={`py-2 text-[11px] font-medium text-slate-500 ${CELL_VDIV}`}>SAP Data</TableCell>
      <TableCell className={`py-2 text-[11px] font-medium text-slate-500 ${CELL_VDIV}`}>Scheduled Dealer</TableCell>
      <TableCell className={`py-2 text-[11px] font-medium text-slate-500 ${CELL_VDIV}`}>Matched PO No</TableCell>
      <TableCell className={`py-2 text-[11px] font-medium text-slate-500 ${CELL_VDIV}`}>Transport</TableCell>
      <TableCell className={`py-2 text-[11px] font-medium text-slate-500 text-center ${CELL_VDIV}`}>Action</TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* 自然标题行（不吸附） */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Dispatch Data</h2>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search chassis / dealer / PO / comment ..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-[280px]"
          />
          <Button variant="outline" className="shrink-0" onClick={exportExcel}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Card className="w-full max-w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-600">Summary</CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="w-full max-w-full overflow-x-hidden">
            <Table className="w-full table-fixed">
              {/* 定宽列 */}
              <colgroup>
                {COLS.map((c) => (
                  <col key={c.key} style={{ width: c.w === 8 ? "8px" : `${c.w}px` }} />
                ))}
              </colgroup>

              {/* 总表头（仅页首出现，不吸附） */}
              <TableHeader className="bg-slate-50 border-y border-slate-200">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="p-0" /> {/* 左色条占位 */}
                  <SortableHeader sortKey="Chassis No">Chassis</SortableHeader>
                  <SortableHeader sortKey="GR to GI Days" align="center">GR Days</SortableHeader>
                  <SortableHeader sortKey="Customer">Customer</SortableHeader>
                  <SortableHeader sortKey="Model">Model</SortableHeader>
                  <SortableHeader sortKey="SAP Data">SAP Data</SortableHeader>
                  <SortableHeader sortKey="Scheduled Dealer">Scheduled Dealer</SortableHeader>
                  <SortableHeader sortKey="Matched PO No">Matched PO No</SortableHeader>
                  <SortableHeader sortKey="TransportCompany">Transport</SortableHeader>
                  <TableHead className={`text-center align-top pt-3 font-medium text-slate-800 ${CELL_VDIV}`}>
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {activeRows.map((entry, idx) => {
                  const rowKey = getRowKey(entry);
                  const chassisNo = entry["Chassis No"] || rowKey;
                  const barColor = getGRDaysColor(entry["GR to GI Days"] || 0);
                  const barWidth = getGRDaysWidth(entry["GR to GI Days"] || 0, maxGRDays);
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-slate-50/60";

                  const commentValue = commentDraft[rowKey] ?? (entry.Comment ?? "");
                  const pickupLocal  = pickupDraft[rowKey]  ?? (entry.EstimatedPickupAt ? isoToLocal(entry.EstimatedPickupAt) : "");
                  const hasComment = commentValue.trim().length > 0;
                  const hasPickup = pickupLocal.length > 0;
                  const statusLabel = getStatusCheckLabel(entry.Statuscheck);
                  const statusCategory = getStatusCheckCategory(entry.Statuscheck);

                  return (
                    <React.Fragment key={rowKey}>
                      {/* ✅ 每个车架号块的迷你表头（淡色） */}
                      <MiniHeaderRow />

                      {/* 第一行：关键信息 */}
                      <TableRow className={`align-top ${rowBg}`}>
                        {/* 左侧分组色条，rowSpan=2 */}
                        <TableCell rowSpan={2} className="p-0">
                          <div className="h-full w-1 bg-blue-500 rounded-l" />
                        </TableCell>

                        <TableCell className={`${CELL} ${CELL_VDIV} font-medium text-slate-900`} title={chassisNo}>
                          {chassisNo}
                        </TableCell>

                        <TableCell className={`${CELL} ${CELL_VDIV} text-center`} title={String(entry["GR to GI Days"] ?? "-")}>
                          <div className="inline-flex flex-col items-stretch w-full">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-900">{entry["GR to GI Days"] ?? "-"}</span>
                              <span className="text-slate-500">days</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1">
                              <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className={`${CELL} ${CELL_VDIV}`} title={entry.Customer || ""}>{entry.Customer || "-"}</TableCell>
                        <TableCell className={`${CELL} ${CELL_VDIV}`} title={entry.Model || ""}>{entry.Model || "-"}</TableCell>
                        <TableCell className={`${CELL} ${CELL_VDIV}`} title={entry["SAP Data"] || ""}>{entry["SAP Data"] || "-"}</TableCell>
                        <TableCell className={`${CELL} ${CELL_VDIV}`} title={entry["Scheduled Dealer"] || ""}>{entry["Scheduled Dealer"] || "-"}</TableCell>
                        <TableCell className={`${CELL} ${CELL_VDIV}`} title={entry["Matched PO No"] || ""}>{entry["Matched PO No"] || "-"}</TableCell>
                        <TableCell className={`${CELL} ${CELL_VDIV}`}>
                          <div className="flex flex-col gap-2">
                            <select
                              className="w-full rounded border px-2 py-1 text-sm"
                              value={entry.TransportCompany || ""}
                              onChange={(e) => handleSaveTransport(entry, e.target.value || null)}
                            >
                              <option value="">Select company</option>
                              {transportOptions.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>

                            {findCompanyByName(entry.TransportCompany)?.dealers?.length ? (
                              <select
                                className="w-full rounded border px-2 py-1 text-sm"
                                value={entry.TransportDealer || ""}
                                onChange={(e) => handleSaveTransport(entry, entry.TransportCompany || null, e.target.value || null)}
                              >
                                <option value="">Select dealer</option>
                                {findCompanyByName(entry.TransportCompany)?.dealers?.map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        </TableCell>

                        <TableCell className={`${CELL_VDIV} text-center`}>
                          <div className="flex flex-col items-center gap-2">
                            <Button
                              size="sm"
                              className="bg-red-600 text-white"
                              disabled={saving[rowKey]}
                              onClick={() => handleToggleOnHold(entry, true)}
                            >
                              On Hold
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={saving[rowKey]}
                              onClick={() => handleToggleTemporaryLeaving(entry, true)}
                            >
                              Temporary Leaving without PGI
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* 第二行：编辑 & 扩展 */}
                      <TableRow className={`${rowBg}`}>
                        {/* 第二行合并 9 列（不含左条） */}
                        <TableCell colSpan={9} className="border-b border-slate-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 py-3 px-2">
                            {/* Comment */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] text-slate-600 w-28 shrink-0">Comment</span>
                              <Input
                                className={`w-full max-w-[320px] ${hasComment ? "border-emerald-300 bg-emerald-50/70" : ""}`}
                                placeholder="Add a comment"
                                value={commentValue}
                                onChange={(e) => setCommentDraft((m) => ({ ...m, [rowKey]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveComment(entry); }}
                              />
                              <Button size="sm" variant="secondary" disabled={saving[rowKey]} onClick={() => handleSaveComment(entry)}>
                                Save
                              </Button>
                            </div>

                            {/* Estimated pickup */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] text-slate-600 w-28 shrink-0">Pickup</span>
                              <input
                                type="datetime-local"
                                className={`px-2 py-1 border rounded w-full max-w-[260px] ${hasPickup ? "border-emerald-300 bg-emerald-50/70" : ""}`}
                                min={minLocalNow}
                                value={pickupLocal}
                                onChange={(e) => setPickupDraft((m) => ({ ...m, [rowKey]: e.target.value }))}
                              />
                              <Button size="sm" variant="secondary" disabled={saving[rowKey]} onClick={() => handleSavePickup(entry)}>
                                Save
                              </Button>
                            </div>

                            {/* Checks */}
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-[13px] text-slate-600 w-24 shrink-0">Checks</span>
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  statusCategory === "ok" ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}
                                title={`Status: ${statusLabel}`}
                              >
                                Status: {statusLabel}
                              </span>
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  entry.DealerCheck === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}
                                title={`Dealer: ${entry.DealerCheck || "-"}`}
                              >
                                Dealer: {entry.DealerCheck || "-"}
                              </span>
                            </div>

                            {/* Reallocation（红） */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] text-slate-600 w-28 shrink-0">Reallocation</span>
                              <span
                                className={`px-2 py-1 rounded text-xs ${entry.reallocatedTo ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-500'}`}
                                title={entry.reallocatedTo || "-"}
                              >
                                {entry.reallocatedTo || "-"}
                              </span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] text-slate-600 w-20 shrink-0">Actions</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReportError(entry)}
                                disabled={sendingEmail === chassisNo}
                                className="inline-flex items-center gap-1 text-xs"
                              >
                                {sendingEmail === chassisNo ? (
                                  <>
                                    <Mail className="h-3 w-3 animate-pulse" />
                                    <span className="hidden sm:inline">Sending...</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="h-3 w-3" />
                                    <span className="hidden sm:inline">Report</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* 组间留白（柔和分隔） */}
                      <TableRow>
                        <TableCell colSpan={10} className="p-0">
                          <div className="h-3" />
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* On Hold 卡片 */}
      <OnHoldBoard
        rows={onHoldRows}
        saving={saving}
        error={error}
        commentDraft={commentDraft}
        pickupDraft={pickupDraft}
        setCommentDraft={setCommentDraft}
        setPickupDraft={setPickupDraft}
        handlers={{ handleToggleOnHold, handleSaveComment, handleSavePickup }}
      />

      <TemporaryLeavingBoard
        rows={temporaryLeavingRows}
        saving={saving}
        error={error}
        commentDraft={commentDraft}
        setCommentDraft={setCommentDraft}
        handlers={{ handleToggleTemporaryLeaving, handleSaveComment }}
      />
    </div>
  );
};

/* ====================== On Hold 卡片 ====================== */
const OnHoldBoard: React.FC<{
  rows: ProcessedDispatchEntry[];
  saving: Record<string, boolean>;
  error: Record<string, string | undefined>;
  commentDraft: Record<string, string>;
  pickupDraft: Record<string, string>;
  setCommentDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setPickupDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handlers: {
    handleToggleOnHold: (row: ProcessedDispatchEntry, next: boolean) => Promise<void>;
    handleSaveComment: (row: ProcessedDispatchEntry) => Promise<void>;
    handleSavePickup: (row: ProcessedDispatchEntry) => Promise<void>;
  };
}> = ({
  rows, saving, error, commentDraft, pickupDraft, setCommentDraft, setPickupDraft, handlers
}) => {
  if (!rows.length) return null;
  return (
    <Card className="w-full max-w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-5 bg-red-600 rounded" />
          <CardTitle className="text-base font-semibold text-slate-900">On Hold</CardTitle>
          <div className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            {rows.length} Items
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 items-stretch w-full max-w-full">
          {rows.map((row, idx) => {
            const rowKey = row.dispatchKey ?? row["Chassis No"] ?? "";
            const chassisNo = row["Chassis No"] || rowKey;
            const commentValue = commentDraft[rowKey] ?? (row.Comment ?? "");
            const pickupLocal  = pickupDraft[rowKey]  ?? (row.EstimatedPickupAt ? new Date(row.EstimatedPickupAt).toISOString().slice(0,16) : "");
            const hasComment = commentValue.trim().length > 0;
            const hasPickup = pickupLocal.length > 0;
            return (
              <div key={rowKey} className={`h-full min-h-[260px] flex flex-col rounded-lg border border-slate-200 p-4 ${idx % 2 ? "bg-white" : "bg-slate-50/50"}`}>
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-200">
                  <div className="font-medium text-sm text-slate-900 break-all">{chassisNo}</div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                      On Hold
                    </span>
                    <Button
                      size="sm"
                      className="bg-emerald-600 text-white"
                      disabled={saving[rowKey]}
                      onClick={() => handlers.handleToggleOnHold(row, false)}
                    >
                      Mark Ready
                    </Button>
                  </div>
                </div>

                <div className="mt-2 text-sm space-y-1.5 flex-1">
                  <div className={CELL}><span className="text-slate-500">Customer: </span>{row.Customer || "-"}</div>
                  <div className={CELL}><span className="text-slate-500">Model: </span>{row.Model || "-"}</div>
                  <div className={CELL}><span className="text-slate-500">Transport: </span>{row.TransportCompany || "-"}</div>
                  <div className={CELL}><span className="text-slate-500">Dealer: </span>{row.TransportDealer || "-"}</div>
                  <div className={CELL}><span className="text-slate-500">Matched PO: </span>{row["Matched PO No"] || "-"}</div>
                </div>

                <div className="mt-3 space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-2">
                    <Input
                      className={`w-full ${hasComment ? "border-emerald-300 bg-emerald-50/70" : ""}`}
                      placeholder="Add a comment"
                      value={commentValue}
                      onChange={(e) => setCommentDraft((m) => ({ ...m, [rowKey]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handlers.handleSaveComment(row); }}
                    />
                    <Button size="sm" variant="secondary" disabled={saving[rowKey]} onClick={() => handlers.handleSaveComment(row)}>
                      Save
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      className={`px-2 py-1 border rounded w-full ${hasPickup ? "border-emerald-300 bg-emerald-50/70" : ""}`}
                      min={new Date().toISOString().slice(0,16)}
                      value={pickupLocal}
                      onChange={(e) => setPickupDraft((m) => ({ ...m, [rowKey]: e.target.value }))}
                    />
                    <Button size="sm" variant="secondary" disabled={saving[rowKey]} onClick={() => handlers.handleSavePickup(row)}>
                      Save
                    </Button>
                  </div>

                  {error[rowKey] && <div className="text-xs text-red-600">{error[rowKey]}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

/* ====================== Temporary Leaving without PGI 卡片 ====================== */
const TemporaryLeavingBoard: React.FC<{
  rows: ProcessedDispatchEntry[];
  saving: Record<string, boolean>;
  error: Record<string, string | undefined>;
  commentDraft: Record<string, string>;
  setCommentDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handlers: {
    handleToggleTemporaryLeaving: (row: ProcessedDispatchEntry, next: boolean) => Promise<void>;
    handleSaveComment: (row: ProcessedDispatchEntry) => Promise<void>;
  };
}> = ({ rows, saving, error, commentDraft, setCommentDraft, handlers }) => {
  if (!rows.length) return null;
  return (
    <Card className="w-full max-w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-5 bg-amber-500 rounded" />
          <CardTitle className="text-base font-semibold text-slate-900">Temporary Leaving without PGI</CardTitle>
          <div className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
            {rows.length} Items
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 items-stretch w-full max-w-full">
          {rows.map((row, idx) => {
            const rowKey = row.dispatchKey ?? row["Chassis No"] ?? "";
            const chassisNo = row["Chassis No"] || rowKey;
            const commentValue = commentDraft[rowKey] ?? (row.Comment ?? "");
            const hasComment = commentValue.trim().length > 0;
            return (
              <div key={rowKey} className={`h-full min-h-[240px] flex flex-col rounded-lg border border-slate-200 p-4 ${idx % 2 ? "bg-white" : "bg-slate-50/50"}`}>
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-200">
                  <div className="font-medium text-sm text-slate-900 break-all">{chassisNo}</div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                      Temporary Leaving
                    </span>
                    <Button
                      size="sm"
                      className="bg-emerald-600 text-white"
                      disabled={saving[rowKey]}
                      onClick={() => handlers.handleToggleTemporaryLeaving(row, false)}
                    >
                      Mark Ready
                    </Button>
                  </div>
                </div>

                <div className="mt-2 text-sm space-y-1.5 flex-1">
                  <div className={CELL}><span className="text-slate-500">Customer: </span>{row.Customer || "-"}</div>
                  <div className={CELL}><span className="text-slate-500">Model: </span>{row.Model || "-"}</div>
                  <div className={CELL}><span className="text-slate-500">Transport: </span>{row.TransportCompany || "-"}</div>
                  <div className={CELL}><span className="text-slate-500">Dealer: </span>{row.TransportDealer || "-"}</div>
                  <div className={CELL}><span className="text-slate-500">Matched PO: </span>{row["Matched PO No"] || "-"}</div>
                </div>

                <div className="mt-3 space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-2">
                    <Input
                      className={`w-full ${hasComment ? "border-emerald-300 bg-emerald-50/70" : ""}`}
                      placeholder="Add a comment"
                      value={commentValue}
                      onChange={(e) => setCommentDraft((m) => ({ ...m, [rowKey]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handlers.handleSaveComment(row); }}
                    />
                    <Button size="sm" variant="secondary" disabled={saving[rowKey]} onClick={() => handlers.handleSaveComment(row)}>
                      Save
                    </Button>
                  </div>
                  {error[rowKey] && <div className="text-xs text-red-600">{error[rowKey]}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

/* ====================== ReallocationTable ====================== */
interface ReallocationTableProps {
  data: ProcessedReallocationEntry[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  dispatchData: ProcessedDispatchEntry[];
}

export const ReallocationTable: React.FC<ReallocationTableProps> = ({
  data, searchTerm, onSearchChange, dispatchData
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc'; } | null>(null);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const safeStringIncludes = (v: any, s: string) => v != null && String(v).toLowerCase().includes(s);

  const filteredAndSortedData = useMemo(() => {
    const s = (searchTerm || "").toLowerCase();
    let filtered = s
      ? data.filter(re =>
          safeStringIncludes(re.chassisNumber, s) ||
          safeStringIncludes(re.customer, s) ||
          safeStringIncludes(re.model, s) ||
          safeStringIncludes(re.originalDealer, s) ||
          safeStringIncludes(re.reallocatedTo, s) ||
          safeStringIncludes(re.regentProduction, s) ||
          safeStringIncludes(re.issue?.type, s) ||
          dispatchData.some(d => d["Chassis No"] === re.chassisNumber && (
            safeStringIncludes(d["Scheduled Dealer"], s) || safeStringIncludes(d["SAP Data"], s)
          ))
        )
      : data;

    if (sortConfig) {
      filtered = [...filtered].sort((a: any, b: any) => {
        const aValue = (a as any)[sortConfig.key];
        const bValue = (b as any)[sortConfig.key];
        const aStr = String(aValue ?? '').toLowerCase();
        const bStr = String(bValue ?? '').toLowerCase();
        return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }
    return filtered;
  }, [data, dispatchData, searchTerm, sortConfig]);

  const SortableHeader = ({ children, sortKey, className = "" }: { children: React.ReactNode; sortKey: string; className?: string }) => (
    <TableHead className={`cursor-pointer hover:bg-slate-50 transition-colors ${CELL_VDIV} ${className}`} onClick={() => handleSort(sortKey)}>
      <div className="flex items-center gap-1">
        <span className="truncate font-medium text-slate-800">{children}</span>
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </div>
    </TableHead>
  );

  return (
    <Card className="w-full max-w-full">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-5 bg-purple-600 rounded" />
            <CardTitle className="text-base font-semibold text-slate-900">Reallocation</CardTitle>
            <div className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
              {filteredAndSortedData.length} Items
            </div>
          </div>
          <Input
            placeholder="Search reallocations..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full sm:max-w-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="w-full max-w-full overflow-x-hidden">
          <Table className="w-full table-fixed">
            <TableHeader className="bg-slate-50 border-y border-slate-200">
              <TableRow>
                <SortableHeader sortKey="chassisNumber">Chassis</SortableHeader>
                <SortableHeader sortKey="customer">Customer</SortableHeader>
                <SortableHeader sortKey="model">Model</SortableHeader>
                <SortableHeader sortKey="originalDealer">Original Dealer</SortableHeader>
                <SortableHeader sortKey="reallocatedTo">Reallocated To</SortableHeader>
                <SortableHeader sortKey="regentProduction">Regent Production</SortableHeader>
                <SortableHeader sortKey="issue">Issue</SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedData.map((re, idx) => (
                <TableRow key={`${re.chassisNumber}-${(re as any).entryId || re.submitTime || "row"}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                  <TableCell className={`${CELL} ${CELL_VDIV} font-medium text-slate-900`} title={re.chassisNumber}>{re.chassisNumber}</TableCell>
                  <TableCell className={`${CELL} ${CELL_VDIV}`} title={re.customer || ""}>{re.customer || "-"}</TableCell>
                  <TableCell className={`${CELL} ${CELL_VDIV}`} title={re.model || ""}>{re.model || "-"}</TableCell>
                  <TableCell className={`${CELL} ${CELL_VDIV}`} title={re.originalDealer || ""}>{re.originalDealer || "-"}</TableCell>
                  <TableCell className={`${CELL} ${CELL_VDIV}`} title={re.reallocatedTo || ""}>{re.reallocatedTo || "-"}</TableCell>
                  <TableCell className={`${CELL} ${CELL_VDIV}`} title={re.regentProduction || ""}>{re.regentProduction || "-"}</TableCell>
                  <TableCell className={`${CELL}`} title={re.issue?.type || ""}>{re.issue?.type || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
