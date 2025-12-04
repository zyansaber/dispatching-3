import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, ClipboardList, ArrowLeftRight, type LucideIcon } from "lucide-react";

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

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { to: "/stock", label: "Stock Sheet", icon: ClipboardList },
  { to: "/dispatch", label: "Dispatch Dashboard", icon: LayoutDashboard },
  { to: "/reallocation", label: "Reallocation", icon: ArrowLeftRight },
];

const WorkspaceSidebar: React.FC = () => (
  <aside className="space-y-4">
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
            DW
          </div>
          <div>
            <CardTitle className="text-lg">Dispatch Workspace</CardTitle>
            <CardDescription>Realtime stock & dispatch monitor</CardDescription>
          </div>
        </div>
        <Badge variant="secondary" className="gap-2 px-2.5 py-1 text-[11px]">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Live
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/80 bg-background text-foreground"
                }`
              }
              end
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </CardContent>
    </Card>
  </aside>
);

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

  return (
    <DashboardContext.Provider value={contextValue}>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[260px_1fr] xl:grid-cols-[300px_1fr]">
            <WorkspaceSidebar />

            <main className="space-y-6">
              <Card className="border-border/80 shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle className="text-2xl md:text-3xl">Dispatch Workspace</CardTitle>
                      <CardDescription>Stock sheet, dispatch data, and reallocation insights in one place.</CardDescription>
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
                <CardContent>
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
