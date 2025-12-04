import React, { useEffect, useMemo, useState } from "react";
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
import { DispatchStats, DispatchTable, ReallocationTable } from "@/components/DataTables";
import { Button } from "@/components/ui/button";
import StockSheetTable from "@/components/StockSheetTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeftRight, ClipboardList, LayoutDashboard, Sparkles } from "lucide-react";

const IndexPage: React.FC = () => {
  // 原始数据
  const [dispatchRaw, setDispatchRaw] = useState<DispatchData>({});
  const [reallocRaw, setReallocRaw] = useState<ReallocationData>({});
  const [schedule, setSchedule] = useState<ScheduleData>([]);
  const [dispatchingNote, setDispatchingNote] = useState<DispatchingNoteData>({});

  // 处理后数据
  const [dispatchProcessed, setDispatchProcessed] = useState<ProcessedDispatchEntry[]>([]);
  const [reallocProcessed, setReallocProcessed] = useState<ProcessedReallocationEntry[]>([]);

  // UI 状态
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<'all' | 'invalid' | 'snowy' | 'canBeDispatched' | 'onHold'>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [showReallocation, setShowReallocation] = useState<boolean>(false); // 默认隐藏
  const [activeTab, setActiveTab] = useState<"stock" | "dispatch">("stock");

  // 顶部统计
  const stats = useMemo(() => getDispatchStats(dispatchRaw, reallocRaw), [dispatchRaw, reallocRaw]);

  const filterOptions = useMemo(
    () => [
      { key: "all" as const, label: "All", count: stats.total, hint: "Everything in the feed" },
      { key: "invalid" as const, label: "Invalid", count: stats.invalidStock, hint: "Stock mismatch" },
      { key: "snowy" as const, label: "Snowy", count: stats.snowyStock, hint: "Snowy stock flagged" },
      { key: "canBeDispatched" as const, label: "Can Dispatch", count: stats.canBeDispatched, hint: "Cleared for action" },
      { key: "onHold" as const, label: "On Hold", count: stats.onHold, hint: "Waiting for review" },
    ],
    [stats]
  );

  // 初次加载 + 订阅
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

  // derive 处理数据
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-6">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-6 space-y-6">
              <div className="rounded-2xl border bg-white px-4 py-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white font-semibold">
                    DW
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-900">Dispatch Workspace</p>
                    <p className="text-xs text-slate-500">Realtime stock &amp; dispatch monitor</p>
                  </div>
                </div>
                <div className="mt-6 space-y-3">
                  <Button
                    variant={activeTab === "stock" ? "default" : "secondary"}
                    className="w-full justify-start gap-2"
                    onClick={() => setActiveTab("stock")}
                  >
                    <ClipboardList className="h-4 w-4" />
                    Stock Sheet
                  </Button>
                  <Button
                    variant={activeTab === "dispatch" ? "default" : "secondary"}
                    className="w-full justify-start gap-2"
                    onClick={() => setActiveTab("dispatch")}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dispatch Dashboard
                  </Button>
                  <Button
                    variant={showReallocation ? "default" : "outline"}
                    className="w-full justify-start gap-2"
                    onClick={() => setShowReallocation((s) => !s)}
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                    {showReallocation ? "Hide Reallocation" : "Show Reallocation"}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Quick filters</p>
                  <Sparkles className="h-4 w-4 text-blue-500" />
                </div>
                <p className="mt-1 text-xs text-slate-500">Syncs with the dashboard summary cards.</p>
                <div className="mt-4 space-y-2">
                  {filterOptions.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setActiveFilter(option.key)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition hover:border-blue-200 hover:bg-blue-50/50 ${activeFilter === option.key ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{option.label}</p>
                        <p className="text-[11px] text-slate-500">{option.hint}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {option.count ?? 0}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">Dispatch Workspace</h1>
                  <p className="text-sm text-slate-500">Stock sheet, dispatch data, and reallocation insights in one place.</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Live subscription
                  </div>
                  {loading && <span className="text-xs text-slate-500">Syncing...</span>}
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
                <TabsList className="w-fit rounded-full border bg-slate-100 p-1 shadow-inner">
                  <TabsTrigger value="stock" className="rounded-full px-4 py-2 text-sm">Stock Sheet</TabsTrigger>
                  <TabsTrigger value="dispatch" className="rounded-full px-4 py-2 text-sm">Dispatch Dashboard</TabsTrigger>
                </TabsList>

                <TabsContent value="stock" className="space-y-4">
                  <StockSheetTable
                    notes={dispatchingNote}
                    schedule={schedule}
                    reallocations={reallocRaw}
                    onSave={handleSaveDispatchingNote}
                    onDelete={handleDeleteDispatchingNote}
                  />
                </TabsContent>

                <TabsContent value="dispatch" className="space-y-4">
                  <DispatchStats
                    total={stats.total}
                    invalidStock={stats.invalidStock}
                    snowyStock={stats.snowyStock}
                    canBeDispatched={stats.canBeDispatched}
                    onHold={stats.onHold}
                    activeFilter={activeFilter}
                    onFilterChange={setActiveFilter}
                    onRefresh={() => { /* 实时订阅，无需手动 refresh */ }}
                  />

                  <DispatchTable
                    allData={dispatchProcessed}
                    activeFilter={activeFilter}
                    searchTerm={search}
                    onSearchChange={setSearch}
                    reallocationData={reallocProcessed}
                  />

                  {showReallocation && (
                    <ReallocationTable
                      data={reallocProcessed}
                      searchTerm={search}
                      onSearchChange={setSearch}
                      dispatchData={dispatchProcessed}
                    />
                  )}
                </TabsContent>
              </Tabs>

              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-500" />
                  <span>Use the sidebar quick filters or summary cards to focus on the right queue.</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowReallocation((s) => !s)}>
                  {showReallocation ? "Hide reallocation view" : "Show reallocation view"}
                </Button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default IndexPage;
