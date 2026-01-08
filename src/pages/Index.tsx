import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import {
  fetchDispatchData,
  fetchDispatchingNoteData,
  fetchReallocationData,
  fetchScheduleData,
  processDispatchData,
  processReallocationData,
  getDispatchStats,
  filterDispatchData,
  subscribeDispatch,
  subscribeDispatchingNote,
  subscribeReallocation,
  fetchTransportCompanies,
  subscribeTransportCompanies,
  upsertTransportCompany,
  deleteTransportCompany,
  patchDispatchingNote,
  deleteDispatchingNote,
} from "@/lib/firebase";
import {
  DispatchData,
  DispatchingNoteData,
  ReallocationData,
  ScheduleData,
  ProcessedDispatchEntry,
  ProcessedReallocationEntry,
  TransportCompany,
  TransportConfig,
} from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";

export type SidebarFilter =
  | { kind: "grRange"; label: string; min: number; max?: number | null };

interface DashboardContextValue {
  dispatchRaw: DispatchData;
  reallocRaw: ReallocationData;
  schedule: ScheduleData;
  dispatchingNote: DispatchingNoteData;
  dispatchProcessed: ProcessedDispatchEntry[];
  reallocProcessed: ProcessedReallocationEntry[];
  stats: ReturnType<typeof getDispatchStats>;
  loading: boolean;
  refreshing: boolean;
  transportCompanies: TransportConfig;
  handleSaveDispatchingNote: (
    chassisNo: string,
    patch: Partial<DispatchingNoteData[string]>
  ) => Promise<void>;
  handleDeleteDispatchingNote: (chassisNo: string) => Promise<void>;
  handleRefreshData: () => Promise<void>;
  handleSaveTransportCompany: (
    companyId: string | null,
    data: Partial<TransportCompany>
  ) => Promise<void>;
  handleDeleteTransportCompany: (companyId: string) => Promise<void>;
  sidebarFilter: SidebarFilter | null;
  setSidebarFilter: (filter: SidebarFilter | null) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export const useDashboardContext = () => {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("Dashboard context is not available");
  return ctx;
};

const IndexPage: React.FC = () => {
  const [dispatchRaw, setDispatchRaw] = useState<DispatchData>({});
  const [reallocRaw, setReallocRaw] = useState<ReallocationData>({});
  const [schedule, setSchedule] = useState<ScheduleData>([]);
  const [dispatchingNote, setDispatchingNote] = useState<DispatchingNoteData>({});

  const [dispatchProcessed, setDispatchProcessed] = useState<ProcessedDispatchEntry[]>([]);
  const [reallocProcessed, setReallocProcessed] = useState<ProcessedReallocationEntry[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [transportCompanies, setTransportCompanies] = useState<TransportConfig>({});
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter | null>(null);

  const navigate = useNavigate();

  const stats = useMemo(() => getDispatchStats(dispatchRaw, reallocRaw), [dispatchRaw, reallocRaw]);

  const readyToDispatch = useMemo(
    () => filterDispatchData(dispatchProcessed, "canBeDispatched", reallocRaw),
    [dispatchProcessed, reallocRaw]
  );

  const onHoldStock = useMemo(
    () => filterDispatchData(dispatchProcessed, "onHold", reallocRaw),
    [dispatchProcessed, reallocRaw]
  );

  const stockEntries = useMemo(() => {
    const merged = new Map<string, ProcessedDispatchEntry>();
    [...readyToDispatch, ...onHoldStock].forEach((entry) => {
      if (!entry["Chassis No"]) return;
      merged.set(entry["Chassis No"], entry);
    });

    return Array.from(merged.values());
  }, [onHoldStock, readyToDispatch]);

  const bookedCount = useMemo(
    () =>
      stockEntries.filter((entry) => {
        const poNo = entry["Matched PO No"];
        return typeof poNo === "string" ? poNo.trim().length > 0 : Boolean(poNo);
      }).length,
    [stockEntries]
  );

  const transportNoPOCount = useMemo(
    () =>
      stockEntries.filter((entry) => {
        const poNo = entry["Matched PO No"];
        const hasPO = typeof poNo === "string" ? poNo.trim().length > 0 : Boolean(poNo);
        if (hasPO) return false;
        const company = entry.TransportCompany;
        const hasCompany =
          typeof company === "string" ? company.trim().length > 0 : Boolean(company);
        return Boolean(entry.EstimatedPickupAt) || hasCompany;
      }).length,
    [stockEntries]
  );

  const grRanges = useMemo(() => {
    const buckets = [
      { label: "0-7 days", min: 0, max: 7 },
      { label: "8-14", min: 8, max: 14 },
      { label: "15-30", min: 15, max: 30 },
      { label: "31-60", min: 31, max: 60 },
      { label: "61+", min: 61, max: null },
    ];

    const counts = buckets.map((bucket) => {
      const count = readyToDispatch.filter((entry) => {
        const days = Number(entry["GR to GI Days"] ?? 0) || 0;
        const withinMin = days >= bucket.min;
        const withinMax = bucket.max == null ? true : days <= bucket.max;
        return withinMin && withinMax;
      }).length;
      return { ...bucket, count };
    });

    return counts;
  }, [readyToDispatch]);

  useEffect(() => {
    let unsubDispatch: (() => void) | null = null;
    let unsubRealloc: (() => void) | null = null;
    let unsubNote: (() => void) | null = null;
    let unsubTransport: (() => void) | null = null;

    const initialLoad = async () => {
      setLoading(true);
      await handleRefreshData();
      setLoading(false);
    };

    initialLoad();

    unsubDispatch = subscribeDispatch((d) => setDispatchRaw(d || {}));
    unsubRealloc = subscribeReallocation((r) => setReallocRaw(r || {}));
    unsubNote = subscribeDispatchingNote((n) => setDispatchingNote(n || {}));
    unsubTransport = subscribeTransportCompanies((t) => setTransportCompanies(t || {}));

    return () => {
      unsubDispatch && unsubDispatch();
      unsubRealloc && unsubRealloc();
      unsubNote && unsubNote();
      unsubTransport && unsubTransport();
    };
  }, []);

  useEffect(() => {
    setDispatchProcessed(processDispatchData(dispatchRaw, reallocRaw));
  }, [dispatchRaw, reallocRaw]);

  useEffect(() => {
    setReallocProcessed(processReallocationData(reallocRaw, schedule));
  }, [reallocRaw, schedule]);

  const handleSaveDispatchingNote = async (
    chassisNo: string,
    patch: Partial<DispatchingNoteData[string]>
  ) => {
    const clean = chassisNo.trim();
    if (!clean) return;
    await patchDispatchingNote(clean, { chassisNo: clean, ...patch });
  };

  const handleDeleteDispatchingNote = async (chassisNo: string) => {
    const clean = chassisNo.trim();
    if (!clean) return;
    await deleteDispatchingNote(clean);
  };

  const handleSaveTransportCompany = async (
    companyId: string | null,
    data: Partial<TransportCompany>
  ) => {
    const normalizedId = companyId?.trim() || null;
    const payload: Partial<TransportCompany> = {
      ...data,
      name: data.name?.trim() || data.name,
      dealers: data.dealers || [],
    };

    const id = await upsertTransportCompany(normalizedId, payload);
    setTransportCompanies((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...payload,
      },
    }));
  };

  const handleDeleteTransportCompany = async (companyId: string) => {
    const cleanId = companyId.trim();
    if (!cleanId) return;
    await deleteTransportCompany(cleanId);
    setTransportCompanies((prev) => {
      const next = { ...prev };
      delete next[cleanId];
      return next;
    });
  };

  const handleSelectGRRange = (range: SidebarFilter | null) => {
    setSidebarFilter(range);
    navigate("/dispatch");
  };

  const handleRefreshData = async () => {
    setRefreshing(true);
    try {
      const [d, r, s, n, t] = await Promise.all([
        fetchDispatchData(),
        fetchReallocationData(),
        fetchScheduleData(),
        fetchDispatchingNoteData(),
        fetchTransportCompanies(),
      ]);
      setDispatchRaw(d || {});
      setReallocRaw(r || {});
      setSchedule(s || []);
      setDispatchingNote(n || {});
      setTransportCompanies(t || {});
    } finally {
      setRefreshing(false);
    }
  };

  const contextValue: DashboardContextValue = {
    dispatchRaw,
    reallocRaw,
    schedule,
    dispatchingNote,
    dispatchProcessed,
    reallocProcessed,
    stats,
    loading,
    refreshing,
    transportCompanies,
    handleSaveDispatchingNote,
    handleDeleteDispatchingNote,
    handleRefreshData,
    handleSaveTransportCompany,
    handleDeleteTransportCompany,
    sidebarFilter,
    setSidebarFilter,
  };

  const sidebarColumn = sidebarCollapsed ? "80px" : "304px";

  return (
    <DashboardContext.Provider value={contextValue}>
      <div
        className="min-h-screen bg-slate-50"
        style={{ paddingLeft: sidebarColumn, transition: "padding-left 0.3s ease-in-out" }}
      >
        <WorkspaceSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          stats={{
            ...stats,
            booked: bookedCount,
            transportNoPO: transportNoPOCount,
            grRanges,
          }}
          onSelectGRRange={handleSelectGRRange}
        />

        <div className="min-h-screen w-full overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
          <main className="flex min-h-[calc(100vh-2rem)] flex-col rounded-xl border border-border/70 bg-background shadow-sm">
            <CardHeader className="border-b border-border/70 pb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-2xl md:text-3xl">Dispatch Workspace</CardTitle>
                {loading && <CardDescription className="text-right">Syncing latest data…</CardDescription>}
              </div>
            </CardHeader>
            <CardContent className="flex-1 px-4 pb-6">
              <Outlet />
            </CardContent>
          </main>
        </div>
      </div>
    </DashboardContext.Provider>
  );
};

export default IndexPage;
