+81
-196

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import {
  fetchDispatchData,
  fetchDispatchingNoteData,
  fetchReallocationData,
  fetchScheduleData,
  processDispatchData,
  processReallocationData,
  getDispatchStats,
  subscribeDispatch,
  subscribeDispatchingNote,
  subscribeReallocation,
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
} from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";

interface DashboardContextValue {
  dispatchRaw: DispatchData;
  reallocRaw: ReallocationData;
  schedule: ScheduleData;
  dispatchingNote: DispatchingNoteData;
  dispatchProcessed: ProcessedDispatchEntry[];
  reallocProcessed: ProcessedReallocationEntry[];
  stats: ReturnType<typeof getDispatchStats>;
  loading: boolean;
  handleSaveDispatchingNote: (
    chassisNo: string,
    patch: Partial<DispatchingNoteData[string]>
  ) => Promise<void>;
  handleDeleteDispatchingNote: (chassisNo: string) => Promise<void>;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  const stats = useMemo(() => getDispatchStats(dispatchRaw, reallocRaw), [dispatchRaw, reallocRaw]);

  useEffect(() => {
    let unsubDispatch: (() => void) | null = null;
    let unsubRealloc: (() => void) | null = null;
    let unsubNote: (() => void) | null = null;

    (async () => {
      setLoading(true);
      try {
        const [d, r, s, n] = await Promise.all([
          fetchDispatchData(),
          fetchReallocationData(),
          fetchScheduleData(),
          fetchDispatchingNoteData(),
        ]);
        setDispatchRaw(d || {});
        setReallocRaw(r || {});
        setSchedule(s || []);
        setDispatchingNote(n || {});
      } finally {
        setLoading(false);
      }

      unsubDispatch = subscribeDispatch((d) => setDispatchRaw(d || {}));
      unsubRealloc = subscribeReallocation((r) => setReallocRaw(r || {}));
      unsubNote = subscribeDispatchingNote((n) => setDispatchingNote(n || {}));
    })();

    return () => {
      unsubDispatch && unsubDispatch();
      unsubRealloc && unsubRealloc();
      unsubNote && unsubNote();
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

  const contextValue: DashboardContextValue = {
    dispatchRaw,
    reallocRaw,
    schedule,
    dispatchingNote,
    dispatchProcessed,
    reallocProcessed,
    stats,
    loading,
    handleSaveDispatchingNote,
    handleDeleteDispatchingNote,
  };

  const sidebarColumn = sidebarCollapsed ? "72px" : "300px";

  return (
    <DashboardContext.Provider value={contextValue}>
      <div className="min-h-screen w-full overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-screen-2xl px-3 py-6 sm:px-4 lg:px-8">
          <div
            className="grid min-h-[calc(100vh-3rem)] gap-4 lg:gap-6"
            style={{ gridTemplateColumns: `${sidebarColumn} 1fr` }}
          >
            <WorkspaceSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />

            <main className="space-y-6 overflow-hidden">
              <Card className="border-border/80 shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle className="text-2xl md:text-3xl">Dispatch Workspace</CardTitle>
                      <CardDescription>
                        Stock sheet, dispatch data, and reallocation insights in one place.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Live subscription
                      </div>
                      {loading && <span className="text-xs">Syncing...</span>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Outlet />
                </CardContent>
              </Card>
            </main>
          </div>
        </div>
      </div>
    </DashboardContext.Provider>
  );
};

export default IndexPage;
