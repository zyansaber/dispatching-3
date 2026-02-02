import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, AlertTriangle, Mail, Download, ChevronDown, X } from "lucide-react";
import {
  ProcessedDispatchEntry,
  ProcessedReallocationEntry,
  TransportConfig,
  TransportPreferenceData,
  TransportPreferenceItem,
  DeliveryToAssignmentsData,
} from "@/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getGRDaysColor,
  getGRDaysWidth,
  getStatusCheckCategory,
  getStatusCheckLabel,
  reportError,
  patchDispatch,
} from "@/lib/firebase";
import { formatDateTime, formatElapsedTime } from "@/lib/time";
import { toast } from "sonner";
import type { SidebarFilter } from "@/pages/Index";

// XLSX（CDN 注入）
declare global { interface Window { XLSX?: any } }

// 统一样式
const CELL = "text-sm leading-5 whitespace-nowrap overflow-hidden text-ellipsis";
const CELL_VDIV = "border-r border-slate-200 last:border-r-0"; // 竖向浅分隔
const SAVE_BUTTON_CLASS =
  "border border-slate-300 bg-gradient-to-b from-white via-slate-100 to-slate-200 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_4px_rgba(15,23,42,0.2)] hover:from-white hover:to-slate-200 active:translate-y-px active:shadow-[inset_0_2px_4px_rgba(15,23,42,0.25)]";
const STATS_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";

const resolveVinNumber = (entry: ProcessedDispatchEntry) =>
  entry["Vin Number"] ?? (entry as Record<string, any>)["VIN Number"] ?? "";
const isSnowyStockEntry = (entry: ProcessedDispatchEntry) => {
  if (entry.reallocatedTo === "Snowy Stock") return true;
  return (
    entry["Scheduled Dealer"] === "Snowy Stock" &&
    entry.Statuscheck === "OK" &&
    entry.DealerCheck === "OK" &&
    (!entry.reallocatedTo || entry.reallocatedTo.trim() === "")
  );
};

// 列宽（避免左右滚动）
const COLS = [
  { key: "__bar",            w: 8   },
  { key: "Chassis No",       w: 160 },
  { key: "SO Number",        w: 130 },
  { key: "Vin Number",       w: 150 },
  { key: "GR to GI Days",    w: 90  },
  { key: "Customer",         w: 160 },
  { key: "Model",            w: 120 },
  { key: "SAP Data",         w: 150 },
  { key: "Scheduled Dealer", w: 150 },
  { key: "Matched PO No",    w: 150 },
  { key: "Transport",        w: 180 },
  { key: "Action",           w: 160 },
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
  wrongStatus: number;
  noReference: number;
  snowyStock: number;
  waitingForBooking: number;
  canBeDispatched: number;
  onHold?: number;
  booked?: number;
  temporaryLeavingWithoutPGI?: number;
  invalidStock?: number;
  serviceTicket?: number;
  onFilterChange: (filter: 'all' | 'wrongStatus' | 'noReference' | 'snowy' | 'canBeDispatched' | 'onHold' | 'booked' | 'temporaryLeaving' | 'invalidStock' | 'serviceTicket') => void;
  activeFilter?: 'all' | 'wrongStatus' | 'noReference' | 'snowy' | 'canBeDispatched' | 'onHold' | 'booked' | 'temporaryLeaving' | 'invalidStock' | 'serviceTicket';
}

export const DispatchStats: React.FC<DispatchStatsProps> = ({
  wrongStatus, noReference, snowyStock, waitingForBooking, canBeDispatched, onHold, booked,
  temporaryLeavingWithoutPGI, invalidStock, serviceTicket, onFilterChange, activeFilter = "all",
}) => {
  const topCards = [
    { label: "Waiting for booking", value: waitingForBooking, filter: "canBeDispatched" },
    { label: "Snowy Stock", value: snowyStock, filter: "snowy" },
    ...(booked !== undefined ? [{ label: "Booked", value: booked, filter: "booked" } as const] : []),
  ] as const;
  const otherCards = [
    ...(onHold !== undefined ? [{ label: "On Hold", value: onHold, filter: "onHold" } as const] : []),
    ...(temporaryLeavingWithoutPGI !== undefined
      ? [
          {
            label: "Temporary leaving",
            value: temporaryLeavingWithoutPGI,
            filter: "temporaryLeaving",
          } as const,
        ]
      : []),
    ...(invalidStock !== undefined
      ? [
          {
            label: "Invalid stock (to be confirmed)",
            value: invalidStock,
            filter: "invalidStock",
          } as const,
        ]
      : []),
    ...(serviceTicket !== undefined
      ? [
          {
            label: "Service ticket",
            value: serviceTicket,
            filter: "serviceTicket",
          } as const,
        ]
      : []),
  ] as const;
  const dataIssueCards = [
    {
      label: "Not in planning schedule",
      value: noReference,
      filter: "noReference",
      className: "border-amber-200 bg-amber-50/70",
    },
    {
      label: "Wrong CMS status",
      value: wrongStatus,
      filter: "wrongStatus",
      className: "border-rose-200 bg-rose-50/60",
    },
  ] as const;

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      {topCards.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className={`${STATS_GRID} flex-1`}>
            {topCards.map((card) => (
              <Card
                key={card.filter}
                className={`cursor-pointer transition hover:shadow-sm ${activeFilter === card.filter ? "ring-2 ring-blue-500" : ""}`}
                onClick={() => onFilterChange(card.filter as any)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium text-slate-600 truncate">{card.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold text-slate-900">{card.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <div className="text-base font-semibold uppercase tracking-[0.12em] text-slate-400">
          Other
        </div>
        <div className={STATS_GRID}>
          {otherCards.map((card) => (
            <Card
              key={card.label}
              className={`cursor-pointer border transition hover:shadow-sm ${
                activeFilter === card.filter ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => onFilterChange(card.filter as any)}
            >
              <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium text-slate-600 truncate">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold text-slate-900">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-base font-semibold uppercase tracking-[0.12em] text-slate-400">
          Data issue
        </div>
        <div className={STATS_GRID}>
          {dataIssueCards.map((card) => (
            <Card
              key={card.filter}
              className={`cursor-pointer border transition hover:shadow-sm ${card.className} ${
                activeFilter === card.filter ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => onFilterChange(card.filter as any)}
            >
              <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium text-slate-600 truncate">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold text-slate-900">{card.value}</div>
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
  activeFilter?: 'all' | 'wrongStatus' | 'noReference' | 'snowy' | 'canBeDispatched' | 'onHold' | 'booked' | 'temporaryLeaving' | 'invalidStock' | 'serviceTicket';
  transportCompanies?: TransportConfig;
  transportPreferences?: TransportPreferenceData;
  deliveryToAssignments?: DeliveryToAssignmentsData;
  grRangeFilter?: SidebarFilter | null;
}

export const DispatchTable: React.FC<DispatchTableProps> = ({
  allData,
  activeFilter = "all",
  transportCompanies = {},
  transportPreferences = {},
  deliveryToAssignments = {},
  grRangeFilter = null,
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc'; } | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});

  // 行内编辑
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [pickupDraft, setPickupDraft]   = useState<Record<string, string>>({});

  // 乐观
  const [optimistic, setOptimistic]     = useState<Record<string, Partial<ProcessedDispatchEntry>>>({});
  const [saving, setSaving]             = useState<Record<string, boolean>>({});
  const [error, setError]               = useState<Record<string, string | undefined>>({});
  const [openCompanyRow, setOpenCompanyRow] = useState<string | null>(null);
  const [companySearchByRow, setCompanySearchByRow] = useState<Record<string, string>>({});

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
            p.TemporaryLeavingWithoutPGIBy === base.TemporaryLeavingWithoutPGIBy) &&
          (p.InvalidStock === undefined || p.InvalidStock === base.InvalidStock) &&
          (p.InvalidStockAt === undefined || p.InvalidStockAt === base.InvalidStockAt) &&
          (p.InvalidStockBy === undefined || p.InvalidStockBy === base.InvalidStockBy) &&
          (p.ServiceTicket === undefined || p.ServiceTicket === base.ServiceTicket) &&
          (p.ServiceTicketAt === undefined || p.ServiceTicketAt === base.ServiceTicketAt) &&
          (p.ServiceTicketBy === undefined || p.ServiceTicketBy === base.ServiceTicketBy);
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

  const getRowKey = (row: ProcessedDispatchEntry) => row.dispatchKey ?? row["Chassis No"] ?? "";

  const deliveryToLookup = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(deliveryToAssignments || {}).forEach(([key, value]) => {
      const chassis = (value?.chassis || key || "").toLowerCase().trim();
      if (!chassis) return;
      const deliveryTo = (value?.deliveryTo || "").trim();
      if (deliveryTo) {
        map.set(chassis, deliveryTo);
      }
    });
    return map;
  }, [deliveryToAssignments]);

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
    let arr = baseMerged;
    const hasSearch = searchTerm.trim().length > 0;

    if (grRangeFilter?.kind === "grRange") {
      arr = arr.filter((e) => {
        const days = Number(e["GR to GI Days"] ?? 0) || 0;
        const meetsMin = days >= grRangeFilter.min;
        const meetsMax = grRangeFilter.max == null ? true : days <= grRangeFilter.max;
        return meetsMin && meetsMax;
      });
    }

    if (!hasSearch) {
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
      if (activeFilter === "invalidStock") arr = arr.filter(e => e.InvalidStock === true);
      if (activeFilter === "serviceTicket") arr = arr.filter(e => e.ServiceTicket === true);
      if (activeFilter === "booked")    arr = arr.filter(e => {
        const poNo = e["Matched PO No"];
        return (
          !e.OnHold &&
          !e.TemporaryLeavingWithoutPGI &&
          !e.InvalidStock &&
          !e.ServiceTicket &&
          (typeof poNo === "string" ? poNo.trim().length > 0 : Boolean(poNo))
        );
      });
      if (activeFilter === "snowy")
        arr = arr.filter(
          (e) =>
            !e.OnHold &&
            !e.TemporaryLeavingWithoutPGI &&
            !e.InvalidStock &&
            !e.ServiceTicket &&
            isSnowyStockEntry(e)
        );
      if (activeFilter === "canBeDispatched")
        arr = arr.filter(
          (e) =>
            (e.Statuscheck === "OK" ||
              getStatusCheckCategory(e.Statuscheck) === "wrongStatus" ||
              getStatusCheckCategory(e.Statuscheck) === "noReference") &&
            !e.OnHold &&
            !e.TemporaryLeavingWithoutPGI &&
            !e.InvalidStock &&
            !e.ServiceTicket &&
            !isSnowyStockEntry(e)
        );
    }

    if (hasSearch) {
      const s = searchTerm.toLowerCase();
      const matches = (value?: string | number | null) =>
        value != null && String(value).toLowerCase().includes(s);
      arr = arr.filter((e) =>
        matches(e["Chassis No"]) ||
        matches(e["SO Number"]) ||
        matches(resolveVinNumber(e)) ||
        matches(e.Customer) ||
        matches(e.Model) ||
        matches(e["Scheduled Dealer"]) ||
        matches(e.TransportDealer)
      );
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
  }, [baseMerged, activeFilter, sortConfig, grRangeFilter, searchTerm]);

  const activeRows = filtered.filter(
    (e) => !e.OnHold && !e.TemporaryLeavingWithoutPGI && !e.InvalidStock && !e.ServiceTicket
  );
  const onHoldRows = filtered.filter(e =>  e.OnHold);
  const temporaryLeavingRows = filtered.filter(e => e.TemporaryLeavingWithoutPGI);
  const invalidStockRows = filtered.filter(e => e.InvalidStock);
  const serviceTicketRows = filtered.filter(e => e.ServiceTicket);

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
            InvalidStock: false,
            InvalidStockAt: null,
            InvalidStockBy: null,
            ServiceTicket: false,
            ServiceTicketAt: null,
            ServiceTicketBy: null,
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
        delete prev.InvalidStock;
        delete prev.InvalidStockAt;
        delete prev.InvalidStockBy;
        delete prev.ServiceTicket;
        delete prev.ServiceTicketAt;
        delete prev.ServiceTicketBy;
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
        "Please enter a comment for temporary leaving.",
        comment
      );
      if (promptValue == null) return;
      comment = promptValue.trim();
      if (!comment) {
        toast.error("Comment is required for temporary leaving.");
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
            InvalidStock: false,
            InvalidStockAt: null,
            InvalidStockBy: null,
            ServiceTicket: false,
            ServiceTicketAt: null,
            ServiceTicketBy: null,
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
        if (next) {
          delete prev.InvalidStock;
          delete prev.InvalidStockAt;
          delete prev.InvalidStockBy;
          delete prev.ServiceTicket;
          delete prev.ServiceTicketAt;
          delete prev.ServiceTicketBy;
          delete prev.OnHold;
          delete prev.OnHoldAt;
          delete prev.OnHoldBy;
        }
        return { ...m, [id]: prev };
      });
      setError((e) => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const handleToggleInvalidStock = async (row: ProcessedDispatchEntry, next: boolean) => {
    const id = getRowKey(row);
    const patch: Partial<ProcessedDispatchEntry> = {
      InvalidStock: next,
      InvalidStockAt: next ? new Date().toISOString() : null,
      InvalidStockBy: next ? ("webapp" as const) : null,
      ...(next
        ? {
            OnHold: false,
            OnHoldAt: null,
            OnHoldBy: null,
            TemporaryLeavingWithoutPGI: false,
            TemporaryLeavingWithoutPGIAt: null,
            TemporaryLeavingWithoutPGIBy: null,
            ServiceTicket: false,
            ServiceTicketAt: null,
            ServiceTicketBy: null,
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
        delete prev.InvalidStock;
        delete prev.InvalidStockAt;
        delete prev.InvalidStockBy;
        if (next) {
          delete prev.OnHold;
          delete prev.OnHoldAt;
          delete prev.OnHoldBy;
          delete prev.TemporaryLeavingWithoutPGI;
          delete prev.TemporaryLeavingWithoutPGIAt;
          delete prev.TemporaryLeavingWithoutPGIBy;
          delete prev.ServiceTicket;
          delete prev.ServiceTicketAt;
          delete prev.ServiceTicketBy;
        }
        return { ...m, [id]: prev };
      });
      setError((e) => ({ ...e, [id]: err?.message || "Update failed" }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const handleToggleServiceTicket = async (row: ProcessedDispatchEntry, next: boolean) => {
    const id = getRowKey(row);
    let comment = row.Comment ?? "";
    if (next) {
      const promptValue = window.prompt(
        "Please enter a comment for service ticket (optional).",
        comment
      );
      if (promptValue == null) return;
      comment = promptValue.trim();
    }
    const patch: Partial<ProcessedDispatchEntry> = {
      ServiceTicket: next,
      ServiceTicketAt: next ? new Date().toISOString() : null,
      ServiceTicketBy: next ? ("webapp" as const) : null,
      ...(next ? { Comment: comment } : {}),
      ...(next
        ? {
            OnHold: false,
            OnHoldAt: null,
            OnHoldBy: null,
            TemporaryLeavingWithoutPGI: false,
            TemporaryLeavingWithoutPGIAt: null,
            TemporaryLeavingWithoutPGIBy: null,
            InvalidStock: false,
            InvalidStockAt: null,
            InvalidStockBy: null,
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
        delete prev.ServiceTicket;
        delete prev.ServiceTicketAt;
        delete prev.ServiceTicketBy;
        if (next) delete prev.Comment;
        if (next) {
          delete prev.InvalidStock;
          delete prev.InvalidStockAt;
          delete prev.InvalidStockBy;
          delete prev.OnHold;
          delete prev.OnHoldAt;
          delete prev.OnHoldBy;
          delete prev.TemporaryLeavingWithoutPGI;
          delete prev.TemporaryLeavingWithoutPGIAt;
          delete prev.TemporaryLeavingWithoutPGIBy;
        }
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
    const previousCompany = row.TransportCompany || null;
    const isCompanyChanged = company !== previousCompany;
    const nextDealer =
      company !== previousCompany
        ? null
        : dealer === undefined
          ? row.TransportDealer || null
          : dealer;
    const patch: Partial<ProcessedDispatchEntry> = {
      TransportCompany: company,
      TransportDealer: nextDealer,
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
      if (company && isCompanyChanged) {
        try {
          const emailModule = await loadEmailModule();
          await emailModule.sendTransportUpdateEmail({
            chassisNo: row["Chassis No"] || id,
            soNumber: row["SO Number"] ?? null,
            vinNumber: resolveVinNumber(row) || null,
            sapData: row["SAP Data"] ?? null,
            scheduledDealer: row["Scheduled Dealer"] ?? null,
            reallocatedTo: row.reallocatedTo ?? null,
            customer: row.Customer ?? null,
            model: row.Model ?? null,
            transportCompany: company,
            previousCompany,
            actionType: previousCompany ? "change" : "new",
          });
          toast.success(`Transport update email sent for ${row["Chassis No"] || id}.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : null;
          toast.error(message ? `Failed to send transport email: ${message}` : "Failed to send transport email.");
        }
      }
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
    const note = (reportNotes[chassisNo] || "").trim();
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
          errorNote: note || null,
        });
        toast.success(`Report sent for ${chassisNo}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : null;
        toast.error(message ? `Failed to send email report: ${message}` : "Failed to send email report.");
      }
      try {
        await reportError(chassisNo, note || "Dealer check mismatch");
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
    "SO Number": e["SO Number"] ?? "",
    "Vin Number": resolveVinNumber(e),
    "GR to GI Days": e["GR to GI Days"] ?? "",
    Customer: e.Customer ?? "",
    Model: e.Model ?? "",
    "SAP Data": e["SAP Data"] ?? "",
    "Scheduled Dealer": e["Scheduled Dealer"] ?? "",
    "Matched PO No": e["Matched PO No"] ?? "",
    "Transport Company": e.TransportCompany ?? "",
    "Transport Dealer": e.TransportDealer ?? "",
    "On Hold": e.OnHold ? "Yes" : "No",
    "Temporary leaving": e.TemporaryLeavingWithoutPGI ? "Yes" : "No",
    "Invalid stock (to be confirmed)": e.InvalidStock ? "Yes" : "No",
    "Service ticket": e.ServiceTicket ? "Yes" : "No",
    "Service ticket at": e.ServiceTicketAt ?? "",
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

  const transportNameById = useMemo(() => {
    const entries = Object.entries(transportCompanies || {});
    return entries.reduce<Record<string, string>>((acc, [id, company]) => {
      acc[id] = company.name;
      return acc;
    }, {});
  }, [transportCompanies]);

  const findCompanyByName = (name?: string | null) =>
    transportOptions.find((c) => c.name === name);

  const getDealerName = (entry: ProcessedDispatchEntry) =>
    entry.reallocatedTo?.trim() || entry["Scheduled Dealer"]?.trim() || "";

  const normalizePreferences = useCallback(
    (raw: TransportPreferenceItem[]) =>
      raw
        .slice()
        .map((pref) => {
          const vendorName =
            pref.vendorName ||
            (pref.vendorId ? transportNameById[pref.vendorId] : "") ||
            "";
          return {
            ...pref,
            vendorName,
          };
        })
        .filter((pref) => pref.vendorName),
    [transportNameById],
  );

  const getPreferenceList = (dealer: string) => {
    const raw = transportPreferences[dealer]?.preferences || [];
    return normalizePreferences(raw).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  };

  const allVendorPreferences = useMemo(() => {
    const collected: TransportPreferenceItem[] = [];
    for (const entry of Object.values(transportPreferences || {})) {
      if (entry?.preferences?.length) {
        collected.push(...entry.preferences);
      }
    }
    for (const option of transportOptions) {
      collected.push({ order: 0, vendorName: option.name });
    }

    const unique = new Map<string, TransportPreferenceItem>();
    for (const pref of normalizePreferences(collected)) {
      if (!unique.has(pref.vendorName)) {
        unique.set(pref.vendorName, pref);
      }
    }

    return Array.from(unique.values())
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName))
      .map((pref, index) => ({
        ...pref,
        order: index + 1,
      }));
  }, [normalizePreferences, transportOptions, transportPreferences]);

  const isYes = (value?: string | null) =>
    (value || "").trim().toLowerCase() === "yes";

  const bookedCountByVendor = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of allData) {
      const company = row.TransportCompany?.trim();
      if (!company) continue;
      const poNo = row["Matched PO No"];
      const hasBooked =
        !row.OnHold &&
        !row.TemporaryLeavingWithoutPGI &&
        !row.InvalidStock &&
        !row.ServiceTicket &&
        (typeof poNo === "string" ? poNo.trim().length > 0 : Boolean(poNo));
      if (!hasBooked) continue;
      counts[company] = (counts[company] || 0) + 1;
    }
    return counts;
  }, [allData]);

  const renderStars = (score?: string | number | null) => {
    const numeric =
      typeof score === "number"
        ? score
        : Number.parseFloat(score == null ? "" : String(score));
    if (!Number.isFinite(numeric)) return <span className="text-xs text-slate-400">-</span>;
    const normalized = Math.max(0, Math.min(5, (numeric / 10) * 5));
    const percent = Math.round((normalized / 5) * 100);
    return (
      <div className="flex items-center gap-2">
        <div className="relative text-sm leading-none text-slate-200">
          <span>★★★★★</span>
          <span
            className="absolute inset-0 overflow-hidden text-amber-400"
            style={{ width: `${percent}%` }}
          >
            ★★★★★
          </span>
        </div>
        <span className="text-xs font-semibold text-slate-600">{numeric.toFixed(1)}</span>
      </div>
    );
  };

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
      const serviceTicket = serviceTicketRows.map(toPlainRow);

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(active);
      const ws2 = XLSX.utils.json_to_sheet(onhold);
      const ws3 = XLSX.utils.json_to_sheet(serviceTicket);
      XLSX.utils.book_append_sheet(wb, ws1, "Active");
      XLSX.utils.book_append_sheet(wb, ws2, "On Hold");
      XLSX.utils.book_append_sheet(wb, ws3, "Service Ticket");

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
      const serviceTicket = serviceTicketRows.map(toPlainRow);
      downloadBlob(new Blob([rowsToCsv(active)], { type: "text/csv;charset=utf-8" }), `dispatch_active_${new Date().toISOString().slice(0,10)}.csv`);
      downloadBlob(new Blob([rowsToCsv(onhold)], { type: "text/csv;charset=utf-8" }), `dispatch_onhold_${new Date().toISOString().slice(0,10)}.csv`);
      downloadBlob(new Blob([rowsToCsv(serviceTicket)], { type: "text/csv;charset=utf-8" }), `dispatch_service_ticket_${new Date().toISOString().slice(0,10)}.csv`);
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
      <TableCell className={`py-2 text-[11px] font-medium text-slate-500 ${CELL_VDIV}`}>SO Number</TableCell>
      <TableCell className={`py-2 text-[11px] font-medium text-slate-500 ${CELL_VDIV}`}>VIN Number</TableCell>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Dispatch Data</h2>
          <p className="text-base text-slate-500">Search by chassis, customer, model, or dealer.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Input
            placeholder="Search chassis, customer, model, dealer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-72 text-base"
          />
          <Button variant="outline" className="shrink-0 text-base" onClick={exportExcel}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Card className="w-full max-w-full">
        <CardContent className="p-0">
          <div className="table-scroll w-full max-w-full">
            <Table className="w-full min-w-max table-fixed">
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
                  <SortableHeader sortKey="SO Number">SO Number</SortableHeader>
                  <SortableHeader sortKey="Vin Number">VIN Number</SortableHeader>
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
                  const dealerName = getDealerName(entry);
                  const dealerPreferences = dealerName ? getPreferenceList(dealerName) : [];
                  const dealerPreferenceNames = new Set(dealerPreferences.map((pref) => pref.vendorName));
                  const otherCompanyOptions = allVendorPreferences.filter(
                    (pref) => !dealerPreferenceNames.has(pref.vendorName),
                  );
                  const companySearch = (companySearchByRow[rowKey] || "").trim();
                  const normalizedSearch = companySearch.toLowerCase();
                  const matchesCompany = (name: string) =>
                    normalizedSearch.length === 0 || name.toLowerCase().includes(normalizedSearch);
                  const filteredDealerPreferences = dealerPreferences.filter((pref) =>
                    matchesCompany(pref.vendorName),
                  );
                  const filteredOtherCompanyOptions = otherCompanyOptions.filter((pref) =>
                    matchesCompany(pref.vendorName),
                  );
                  const preferenceDescription = dealerName
                    ? `Preferred vendors for ${dealerName}.`
                    : "Preferred vendors.";
                  const otherCompaniesDescription = dealerName
                    ? `Other companies not in ${dealerName}'s preferences.`
                    : "Other companies not in preferences.";
                  const selectedCompanyLabel = entry.TransportCompany?.trim() || "";

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

                      <TableCell className={`${CELL} ${CELL_VDIV}`} title={entry["SO Number"] || ""}>
                        {entry["SO Number"] || "-"}
                      </TableCell>

                      <TableCell className={`${CELL} ${CELL_VDIV}`} title={resolveVinNumber(entry)}>
                        {resolveVinNumber(entry) || "-"}
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
                        <TableCell className={`${CELL} ${CELL_VDIV}`} title={entry["Scheduled Dealer"] || ""}>
                          {(() => {
                            const chassisKey = (chassisNo || "").toLowerCase().trim();
                            const deliveryTo = deliveryToLookup.get(chassisKey) || "";
                            const scheduledDealer = entry["Scheduled Dealer"] || "";
                            const displayDealer = scheduledDealer || "-";
                            if (!deliveryTo) {
                              return displayDealer;
                            }
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-amber-800">
                                <span>{displayDealer}</span>
                                <span className="text-xs font-semibold tracking-wide">
                                  ({deliveryTo})
                                </span>
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className={`${CELL} ${CELL_VDIV}`} title={entry["Matched PO No"] || ""}>{entry["Matched PO No"] || "-"}</TableCell>
                        <TableCell className={`${CELL} ${CELL_VDIV}`}>
                          <div className="flex flex-col gap-2">
                            {findCompanyByName(entry.TransportCompany)?.dealers?.length ? (
                              <select
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
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

                            {dealerPreferences.length || otherCompanyOptions.length ? (
                              <AlertDialog
                                open={openCompanyRow === rowKey}
                                onOpenChange={(open) => setOpenCompanyRow(open ? rowKey : null)}
                              >
                                <AlertDialogTrigger asChild>
                                  <button
                                    type="button"
                                    className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                  >
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
                                        Dealer preferences
                                      </span>
                                      <span className="text-sm font-semibold text-slate-800">
                                        {selectedCompanyLabel || "Select company"}
                                      </span>
                                    </div>
                                    <ChevronDown className="h-4 w-4 text-slate-500" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent
                                  className="max-w-6xl"
                                  onPointerDownOutside={() => setOpenCompanyRow(null)}
                                  onEscapeKeyDown={() => setOpenCompanyRow(null)}
                                >
                                  <AlertDialogHeader className="pr-12">
                                    <AlertDialogTitle>Select transport company</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Choose a vendor from dealer preferences or other available companies.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogCancel asChild>
                                    <button
                                      type="button"
                                      className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                      aria-label="Close"
                                    >
                                      <X className="h-5 w-5" />
                                    </button>
                                  </AlertDialogCancel>
                                  <div className="space-y-4">
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                      <Input
                                        value={companySearchByRow[rowKey] ?? ""}
                                        onChange={(event) =>
                                          setCompanySearchByRow((prev) => ({
                                            ...prev,
                                            [rowKey]: event.target.value,
                                          }))
                                        }
                                        placeholder="Search company name"
                                        className="h-9 bg-white"
                                      />
                                    </div>
                                    <div className="grid max-h-[68vh] gap-4 overflow-hidden md:grid-cols-2">
                                    <div className="flex flex-col gap-2 overflow-hidden">
                                      <div>
                                        <div className="text-sm font-semibold text-slate-900">Dealer preferences</div>
                                        <p className="text-xs text-slate-500">{preferenceDescription}</p>
                                      </div>
                                      <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                                        {filteredDealerPreferences.length ? (
                                          filteredDealerPreferences.map((pref) => {
                                            const isSelected = pref.vendorName === entry.TransportCompany;
                                            const bookedCount = bookedCountByVendor[pref.vendorName] || 0;
                                            return (
                                              <div
                                                key={`${dealerName || "all"}-preference-${pref.order}-${pref.vendorName}`}
                                                className={`grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border p-3 ${
                                                  isSelected ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
                                                }`}
                                              >
                                                <div className="space-y-2">
                                                  <div className="flex items-center gap-2">
                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                                                      {pref.order}
                                                    </span>
                                                    <span className="text-base font-semibold text-slate-900">
                                                      {pref.vendorName}
                                                    </span>
                                                  </div>
                                                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                                                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                                                      Truck number: {pref.truckNumber || "-"}
                                                    </span>
                                                    {renderStars(pref.supplierRating)}
                                                    {isYes(pref.bankGuarantee) ? (
                                                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                                                        Bank guarantee
                                                      </span>
                                                    ) : null}
                                                    {bookedCount > 0 ? (
                                                      <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">
                                                        Booked {bookedCount}
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                </div>
                                                <AlertDialogAction asChild>
                                                  <Button
                                                    className={`min-w-[132px] justify-center ${
                                                      isSelected ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""
                                                    }`}
                                                    onClick={() => handleSaveTransport(entry, pref.vendorName)}
                                                  >
                                                    {isSelected ? "Selected" : "Select vendor"}
                                                  </Button>
                                                </AlertDialogAction>
                                              </div>
                                            );
                                          })
                                        ) : (
                                          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                            {dealerPreferences.length ? "No matching dealer preferences." : "No dealer preferences available."}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-2 overflow-hidden">
                                      <div>
                                        <div className="text-sm font-semibold text-slate-900">Other companies</div>
                                        <p className="text-xs text-slate-500">{otherCompaniesDescription}</p>
                                      </div>
                                      <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                                        {filteredOtherCompanyOptions.length ? (
                                          filteredOtherCompanyOptions.map((pref) => {
                                            const isSelected = pref.vendorName === entry.TransportCompany;
                                            const bookedCount = bookedCountByVendor[pref.vendorName] || 0;
                                            return (
                                              <div
                                                key={`${dealerName || "all"}-other-${pref.order}-${pref.vendorName}`}
                                                className={`grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border p-3 ${
                                                  isSelected ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
                                                }`}
                                              >
                                                <div className="space-y-2">
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-base font-semibold text-slate-900">
                                                      {pref.vendorName}
                                                    </span>
                                                  </div>
                                                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                                                    {pref.truckNumber ? (
                                                      <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                                                        Truck number: {pref.truckNumber}
                                                      </span>
                                                    ) : null}
                                                    {renderStars(pref.supplierRating)}
                                                    {isYes(pref.bankGuarantee) ? (
                                                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                                                        Bank guarantee
                                                      </span>
                                                    ) : null}
                                                    {bookedCount > 0 ? (
                                                      <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">
                                                        Booked {bookedCount}
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                </div>
                                                <AlertDialogAction asChild>
                                                  <Button
                                                    className={`min-w-[132px] justify-center ${
                                                      isSelected ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""
                                                    }`}
                                                    onClick={() => handleSaveTransport(entry, pref.vendorName)}
                                                  >
                                                    {isSelected ? "Selected" : "Select vendor"}
                                                  </Button>
                                                </AlertDialogAction>
                                              </div>
                                            );
                                          })
                                        ) : (
                                          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                            {otherCompanyOptions.length ? "No matching companies." : "No other companies available."}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    </div>
                                  </div>
                                  {entry.TransportCompany ? (
                                    <div className="flex flex-wrap justify-between gap-2">
                                      <AlertDialogAction asChild>
                                        <Button
                                          variant="outline"
                                          className="border-slate-300 text-slate-700 hover:bg-slate-50"
                                          onClick={() => handleSaveTransport(entry, null)}
                                        >
                                          Clear selection
                                        </Button>
                                      </AlertDialogAction>
                                      <AlertDialogCancel asChild>
                                        <Button variant="outline">Close</Button>
                                      </AlertDialogCancel>
                                    </div>
                                  ) : (
                                    <div className="flex justify-end">
                                      <AlertDialogCancel asChild>
                                        <Button variant="outline">Close</Button>
                                      </AlertDialogCancel>
                                    </div>
                                  )}
                                </AlertDialogContent>
                              </AlertDialog>
                            ) : (
                              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                No vendors available.
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className={`${CELL_VDIV} text-center`}>
                          <div className="flex flex-col items-center gap-3">
                            <Button
                              size="sm"
                              className="w-full min-w-[140px] bg-red-600 text-sm text-white"
                              disabled={saving[rowKey]}
                              onClick={() => handleToggleOnHold(entry, true)}
                            >
                              On Hold
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full min-w-[140px] border-slate-300 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
                              disabled={saving[rowKey]}
                              onClick={() => handleToggleTemporaryLeaving(entry, true)}
                            >
                              Temporary leaving
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full min-w-[140px] border-amber-300 text-sm text-amber-700 shadow-sm hover:bg-amber-50"
                              disabled={saving[rowKey]}
                              onClick={() => handleToggleInvalidStock(entry, true)}
                            >
                              Invalid Stock
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full min-w-[140px] border-indigo-300 text-sm text-indigo-700 shadow-sm hover:bg-indigo-50"
                              disabled={saving[rowKey]}
                              onClick={() => handleToggleServiceTicket(entry, true)}
                            >
                              Service Ticket
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* 第二行：编辑 & 扩展 */}
                      <TableRow className={`${rowBg}`}>
                      {/* 第二行合并 11 列（不含左条） */}
                      <TableCell colSpan={11} className="border-b border-slate-200">
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
                              <Button
                                size="sm"
                                variant="secondary"
                                className={SAVE_BUTTON_CLASS}
                                disabled={saving[rowKey]}
                                onClick={() => handleSaveComment(entry)}
                              >
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
                              <Button
                                size="sm"
                                variant="secondary"
                                className={SAVE_BUTTON_CLASS}
                                disabled={saving[rowKey]}
                                onClick={() => handleSavePickup(entry)}
                              >
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
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  value={reportNotes[chassisNo] ?? ""}
                                  onChange={(event) =>
                                    setReportNotes((prev) => ({
                                      ...prev,
                                      [chassisNo]: event.target.value,
                                    }))
                                  }
                                  placeholder="Error note"
                                  className="h-8 w-44 text-xs"
                                />
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
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* 组间留白（柔和分隔） */}
                      <TableRow>
                        <TableCell colSpan={12} className="p-0">
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

      <div className="space-y-6">
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

        <InvalidStockBoard
          rows={invalidStockRows}
          saving={saving}
          error={error}
          commentDraft={commentDraft}
          setCommentDraft={setCommentDraft}
          handlers={{ handleToggleInvalidStock, handleSaveComment }}
        />

        <ServiceTicketBoard
          rows={serviceTicketRows}
          saving={saving}
          error={error}
          commentDraft={commentDraft}
          setCommentDraft={setCommentDraft}
          handlers={{ handleToggleServiceTicket, handleSaveComment }}
        />
      </div>
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
    <section className="w-full space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-5 bg-red-600 rounded" />
        <h3 className="text-base font-semibold text-slate-900">On Hold</h3>
        <div className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
          {rows.length} Items
        </div>
      </div>
      <div className="w-full overflow-hidden rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[140px]">Chassis No</TableHead>
              <TableHead className="min-w-[130px]">SO Number</TableHead>
              <TableHead className="min-w-[150px]">VIN Number</TableHead>
              <TableHead className="min-w-[160px]">Customer</TableHead>
              <TableHead className="min-w-[120px]">Model</TableHead>
              <TableHead className="min-w-[160px]">Transport</TableHead>
              <TableHead className="min-w-[160px]">Matched PO</TableHead>
              <TableHead className="min-w-[260px]">Comment</TableHead>
              <TableHead className="min-w-[260px]">Pickup</TableHead>
              <TableHead className="min-w-[180px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => {
              const rowKey = row.dispatchKey ?? row["Chassis No"] ?? "";
              const chassisNo = row["Chassis No"] || rowKey;
              const commentValue = commentDraft[rowKey] ?? (row.Comment ?? "");
              const pickupLocal  = pickupDraft[rowKey]  ?? (row.EstimatedPickupAt ? new Date(row.EstimatedPickupAt).toISOString().slice(0,16) : "");
              const hasComment = commentValue.trim().length > 0;
              const hasPickup = pickupLocal.length > 0;
              return (
                <TableRow key={rowKey} className={idx % 2 ? "bg-white" : "bg-slate-50/50"}>
                  <TableCell className={`${CELL} font-medium`}>{chassisNo}</TableCell>
                  <TableCell className={CELL}>{row["SO Number"] || "-"}</TableCell>
                  <TableCell className={CELL}>{resolveVinNumber(row) || "-"}</TableCell>
                  <TableCell className={CELL}>{row.Customer || "-"}</TableCell>
                  <TableCell className={CELL}>{row.Model || "-"}</TableCell>
                  <TableCell className={CELL}>{row.TransportCompany || "-"}</TableCell>
                  <TableCell className={CELL}>{row["Matched PO No"] || "-"}</TableCell>
                  <TableCell className="min-w-[260px]">
                    <div className="flex items-center gap-2">
                      <Input
                        className={`w-full ${hasComment ? "border-emerald-300 bg-emerald-50/70" : ""}`}
                        placeholder="Add a comment"
                        value={commentValue}
                        onChange={(e) => setCommentDraft((m) => ({ ...m, [rowKey]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") handlers.handleSaveComment(row); }}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className={SAVE_BUTTON_CLASS}
                        disabled={saving[rowKey]}
                        onClick={() => handlers.handleSaveComment(row)}
                      >
                        Save
                      </Button>
                    </div>
                    {error[rowKey] && <div className="text-xs text-red-600 mt-1">{error[rowKey]}</div>}
                  </TableCell>
                  <TableCell className="min-w-[260px]">
                    <div className="flex items-center gap-2">
                      <input
                        type="datetime-local"
                        className={`px-2 py-1 border rounded w-full ${hasPickup ? "border-emerald-300 bg-emerald-50/70" : ""}`}
                        min={new Date().toISOString().slice(0,16)}
                        value={pickupLocal}
                        onChange={(e) => setPickupDraft((m) => ({ ...m, [rowKey]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className={SAVE_BUTTON_CLASS}
                        disabled={saving[rowKey]}
                        onClick={() => handlers.handleSavePickup(row)}
                      >
                        Save
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    <div className="flex flex-col gap-2">
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 w-fit">
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
};

/* ====================== Temporary leaving 卡片 ====================== */
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
    <section className="w-full space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-5 bg-amber-500 rounded" />
        <h3 className="text-base font-semibold text-slate-900">Temporary leaving</h3>
        <div className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
          {rows.length} Items
        </div>
      </div>
      <div className="w-full overflow-hidden rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[140px]">Chassis No</TableHead>
              <TableHead className="min-w-[130px]">SO Number</TableHead>
              <TableHead className="min-w-[150px]">VIN Number</TableHead>
              <TableHead className="min-w-[160px]">Customer</TableHead>
              <TableHead className="min-w-[120px]">Model</TableHead>
              <TableHead className="min-w-[160px]">Transport</TableHead>
              <TableHead className="min-w-[160px]">Matched PO</TableHead>
              <TableHead className="min-w-[260px]">Comment</TableHead>
              <TableHead className="min-w-[180px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => {
              const rowKey = row.dispatchKey ?? row["Chassis No"] ?? "";
              const chassisNo = row["Chassis No"] || rowKey;
              const commentValue = commentDraft[rowKey] ?? (row.Comment ?? "");
              const hasComment = commentValue.trim().length > 0;
              return (
                <TableRow key={rowKey} className={idx % 2 ? "bg-white" : "bg-slate-50/50"}>
                  <TableCell className={`${CELL} font-medium`}>{chassisNo}</TableCell>
                  <TableCell className={CELL}>{row["SO Number"] || "-"}</TableCell>
                  <TableCell className={CELL}>{resolveVinNumber(row) || "-"}</TableCell>
                  <TableCell className={CELL}>{row.Customer || "-"}</TableCell>
                  <TableCell className={CELL}>{row.Model || "-"}</TableCell>
                  <TableCell className={CELL}>{row.TransportCompany || "-"}</TableCell>
                  <TableCell className={CELL}>{row["Matched PO No"] || "-"}</TableCell>
                  <TableCell className="min-w-[260px]">
                    <div className="flex items-center gap-2">
                      <Input
                        className={`w-full ${hasComment ? "border-emerald-300 bg-emerald-50/70" : ""}`}
                        placeholder="Add a comment"
                        value={commentValue}
                        onChange={(e) => setCommentDraft((m) => ({ ...m, [rowKey]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") handlers.handleSaveComment(row); }}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className={SAVE_BUTTON_CLASS}
                        disabled={saving[rowKey]}
                        onClick={() => handlers.handleSaveComment(row)}
                      >
                        Save
                      </Button>
                    </div>
                    {error[rowKey] && <div className="text-xs text-red-600 mt-1">{error[rowKey]}</div>}
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    <div className="flex flex-col gap-2">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 w-fit">
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
};

/* ====================== Invalid Stock 卡片 ====================== */
const InvalidStockBoard: React.FC<{
  rows: ProcessedDispatchEntry[];
  saving: Record<string, boolean>;
  error: Record<string, string | undefined>;
  commentDraft: Record<string, string>;
  setCommentDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handlers: {
    handleToggleInvalidStock: (row: ProcessedDispatchEntry, next: boolean) => Promise<void>;
    handleSaveComment: (row: ProcessedDispatchEntry) => Promise<void>;
  };
}> = ({ rows, saving, error, commentDraft, setCommentDraft, handlers }) => {
  if (!rows.length) return null;
  return (
    <section className="w-full space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-5 bg-amber-500 rounded" />
        <h3 className="text-base font-semibold text-slate-900">Invalid stock (to be confirmed)</h3>
        <div className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
          {rows.length} Items
        </div>
      </div>
      <div className="w-full overflow-hidden rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[140px]">Chassis No</TableHead>
              <TableHead className="min-w-[130px]">SO Number</TableHead>
              <TableHead className="min-w-[150px]">VIN Number</TableHead>
              <TableHead className="min-w-[160px]">Customer</TableHead>
              <TableHead className="min-w-[120px]">Model</TableHead>
              <TableHead className="min-w-[160px]">Transport</TableHead>
              <TableHead className="min-w-[160px]">Dealer</TableHead>
              <TableHead className="min-w-[160px]">Matched PO</TableHead>
              <TableHead className="min-w-[260px]">Comment</TableHead>
              <TableHead className="min-w-[180px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => {
              const rowKey = row.dispatchKey ?? row["Chassis No"] ?? "";
              const chassisNo = row["Chassis No"] || rowKey;
              const commentValue = commentDraft[rowKey] ?? (row.Comment ?? "");
              const hasComment = commentValue.trim().length > 0;
              return (
                <TableRow key={rowKey} className={idx % 2 ? "bg-white" : "bg-slate-50/50"}>
                  <TableCell className={`${CELL} font-medium`}>{chassisNo}</TableCell>
                  <TableCell className={CELL}>{row["SO Number"] || "-"}</TableCell>
                  <TableCell className={CELL}>{resolveVinNumber(row) || "-"}</TableCell>
                  <TableCell className={CELL}>{row.Customer || "-"}</TableCell>
                  <TableCell className={CELL}>{row.Model || "-"}</TableCell>
                  <TableCell className={CELL}>{row.TransportCompany || "-"}</TableCell>
                  <TableCell className={CELL}>{row.TransportDealer || "-"}</TableCell>
                  <TableCell className={CELL}>{row["Matched PO No"] || "-"}</TableCell>
                  <TableCell className="min-w-[260px]">
                    <div className="flex items-center gap-2">
                      <Input
                        className={`w-full ${hasComment ? "border-emerald-300 bg-emerald-50/70" : ""}`}
                        placeholder="Add a comment"
                        value={commentValue}
                        onChange={(e) => setCommentDraft((m) => ({ ...m, [rowKey]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") handlers.handleSaveComment(row); }}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className={SAVE_BUTTON_CLASS}
                        disabled={saving[rowKey]}
                        onClick={() => handlers.handleSaveComment(row)}
                      >
                        Save
                      </Button>
                    </div>
                    {error[rowKey] && <div className="text-xs text-red-600 mt-1">{error[rowKey]}</div>}
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    <div className="flex flex-col gap-2">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 w-fit">
                        Invalid stock
                      </span>
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white"
                        disabled={saving[rowKey]}
                        onClick={() => handlers.handleToggleInvalidStock(row, false)}
                      >
                        Mark Ready
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
};

/* ====================== Service Ticket 卡片 ====================== */
const ServiceTicketBoard: React.FC<{
  rows: ProcessedDispatchEntry[];
  saving: Record<string, boolean>;
  error: Record<string, string | undefined>;
  commentDraft: Record<string, string>;
  setCommentDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handlers: {
    handleToggleServiceTicket: (row: ProcessedDispatchEntry, next: boolean) => Promise<void>;
    handleSaveComment: (row: ProcessedDispatchEntry) => Promise<void>;
  };
}> = ({ rows, saving, error, commentDraft, setCommentDraft, handlers }) => {
  if (!rows.length) return null;
  return (
    <section className="w-full space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-5 bg-indigo-500 rounded" />
        <h3 className="text-base font-semibold text-slate-900">Service ticket</h3>
        <div className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
          {rows.length} Items
        </div>
      </div>
      <div className="w-full overflow-hidden rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[140px]">Chassis No</TableHead>
              <TableHead className="min-w-[130px]">SO Number</TableHead>
              <TableHead className="min-w-[150px]">VIN Number</TableHead>
              <TableHead className="min-w-[160px]">Customer</TableHead>
              <TableHead className="min-w-[120px]">Model</TableHead>
              <TableHead className="min-w-[200px]">Service ticket at</TableHead>
              <TableHead className="min-w-[180px]">Service duration</TableHead>
              <TableHead className="min-w-[260px]">Comment</TableHead>
              <TableHead className="min-w-[180px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => {
              const rowKey = row.dispatchKey ?? row["Chassis No"] ?? "";
              const chassisNo = row["Chassis No"] || rowKey;
              const commentValue = commentDraft[rowKey] ?? (row.Comment ?? "");
              const hasComment = commentValue.trim().length > 0;
              return (
                <TableRow key={rowKey} className={idx % 2 ? "bg-white" : "bg-slate-50/50"}>
                  <TableCell className={`${CELL} font-medium`}>{chassisNo}</TableCell>
                  <TableCell className={CELL}>{row["SO Number"] || "-"}</TableCell>
                  <TableCell className={CELL}>{resolveVinNumber(row) || "-"}</TableCell>
                  <TableCell className={CELL}>{row.Customer || "-"}</TableCell>
                  <TableCell className={CELL}>{row.Model || "-"}</TableCell>
                  <TableCell className={CELL}>{formatDateTime(row.ServiceTicketAt)}</TableCell>
                  <TableCell className={CELL}>{formatElapsedTime(row.ServiceTicketAt)}</TableCell>
                  <TableCell className="min-w-[260px]">
                    <div className="flex items-center gap-2">
                      <Input
                        className={`w-full ${hasComment ? "border-emerald-300 bg-emerald-50/70" : ""}`}
                        placeholder="Add a comment"
                        value={commentValue}
                        onChange={(e) => setCommentDraft((m) => ({ ...m, [rowKey]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") handlers.handleSaveComment(row); }}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className={SAVE_BUTTON_CLASS}
                        disabled={saving[rowKey]}
                        onClick={() => handlers.handleSaveComment(row)}
                      >
                        Save
                      </Button>
                    </div>
                    {error[rowKey] && <div className="text-xs text-red-600 mt-1">{error[rowKey]}</div>}
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    <div className="flex flex-col gap-2">
                      <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 w-fit">
                        Service ticket
                      </span>
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white"
                        disabled={saving[rowKey]}
                        onClick={() => handlers.handleToggleServiceTicket(row, false)}
                      >
                        Service Get Ready
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
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

  const dispatchLookup = useMemo(() => {
    const map = new Map<string, ProcessedDispatchEntry>();
    dispatchData.forEach((entry) => {
      const chassis = entry["Chassis No"];
      if (chassis) map.set(chassis, entry);
    });
    return map;
  }, [dispatchData]);

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
            safeStringIncludes(d["Scheduled Dealer"], s) ||
            safeStringIncludes(d["SAP Data"], s) ||
            safeStringIncludes(d["SO Number"], s) ||
            safeStringIncludes(resolveVinNumber(d), s)
          ))
        )
      : data;

    if (sortConfig) {
      filtered = [...filtered].sort((a: any, b: any) => {
        const resolveSortValue = (entry: ProcessedReallocationEntry) => {
          if (sortConfig.key === "soNumber") {
            return dispatchLookup.get(entry.chassisNumber)?.["SO Number"] ?? "";
          }
          if (sortConfig.key === "vinNumber") {
            const dispatchEntry = dispatchLookup.get(entry.chassisNumber);
            return dispatchEntry ? resolveVinNumber(dispatchEntry) : "";
          }
          return (entry as any)[sortConfig.key];
        };
        const aValue = resolveSortValue(a);
        const bValue = resolveSortValue(b);
        const aStr = String(aValue ?? '').toLowerCase();
        const bStr = String(bValue ?? '').toLowerCase();
        return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }
    return filtered;
  }, [data, dispatchData, dispatchLookup, searchTerm, sortConfig]);

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
                <SortableHeader sortKey="soNumber">SO Number</SortableHeader>
                <SortableHeader sortKey="vinNumber">VIN Number</SortableHeader>
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
                  {(() => {
                    const dispatchRow = dispatchLookup.get(re.chassisNumber);
                    const soNumber = dispatchRow?.["SO Number"] || "-";
                    const vinNumber = dispatchRow ? resolveVinNumber(dispatchRow) || "-" : "-";
                    return (
                      <>
                        <TableCell className={`${CELL} ${CELL_VDIV} font-medium text-slate-900`} title={re.chassisNumber}>{re.chassisNumber}</TableCell>
                        <TableCell className={`${CELL} ${CELL_VDIV}`} title={soNumber}>{soNumber}</TableCell>
                        <TableCell className={`${CELL} ${CELL_VDIV}`} title={vinNumber}>{vinNumber}</TableCell>
                      </>
                    );
                  })()}
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
