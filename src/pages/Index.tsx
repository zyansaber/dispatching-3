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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <Card className="border-border/80 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
                    DW
                  </div>
                  <div>
                    <CardTitle className="text-lg">Dispatch Workspace</CardTitle>
                    <CardDescription>Realtime stock &amp; dispatch monitor</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="gap-2 px-2.5 py-1 text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Live
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
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
              </CardContent>
            </Card>

            <Card className="border-border/80 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Quick Filters</CardTitle>
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <CardDescription>Syncs with the dashboard summary cards.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {filterOptions.map((option) => {
                  const isActive = activeFilter === option.key;
                  return (
                    <button
                      key={option.key}
                      onClick={() => setActiveFilter(option.key)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isActive
                          ? "border-primary/50 bg-primary/5 text-primary"
                          : "border-border/80 bg-background hover:border-primary/30 hover:bg-primary/5"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <p className="font-medium leading-none">{option.label}</p>
                        <p className="text-[11px] text-muted-foreground">{option.hint}</p>
                      </div>
                      <Badge variant={isActive ? "default" : "secondary"} className="font-semibold">
                        {option.count ?? 0}
                      </Badge>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </aside>

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

              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="px-3 py-1 text-xs font-medium">
                    {dispatchProcessed.length} entries
                  </Badge>
                  <Badge variant="secondary" className="px-3 py-1 text-xs font-medium">
                    {reallocProcessed.length} reallocations
                  </Badge>
                </div>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
                  <TabsList className="w-fit rounded-full border bg-muted/50 p-1">
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

                <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>Use sidebar filters or summary cards to focus on the right queue.</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowReallocation((s) => !s)}>
                    {showReallocation ? "Hide reallocation view" : "Show reallocation view"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
};

export default IndexPage;
