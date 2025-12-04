import React, { useMemo, useState } from "react";
import { DispatchStats, DispatchTable } from "@/components/DataTables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { useDashboardContext } from "./Index";

const DispatchPage: React.FC = () => {
  const { dispatchProcessed, reallocProcessed, stats } = useDashboardContext();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "invalid" | "snowy" | "canBeDispatched" | "onHold">(
    "all"
  );

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="px-3 py-1 text-xs font-medium">
          {dispatchProcessed.length} entries
        </Badge>
        <Badge variant="secondary" className="px-3 py-1 text-xs font-medium">
          {reallocProcessed.length} reallocations
        </Badge>
      </div>

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

      <DispatchStats
        total={stats.total}
        invalidStock={stats.invalidStock}
        snowyStock={stats.snowyStock}
        canBeDispatched={stats.canBeDispatched}
        onHold={stats.onHold}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onRefresh={() => {}}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Use filters or the search box to focus on the right queue.</span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chassis, customer, PO, or comment"
            className="w-64"
          />
          <Button variant="outline" size="sm" onClick={() => setSearch("")}>
            Clear
          </Button>
        </div>
      </div>

      <DispatchTable
        allData={dispatchProcessed}
        activeFilter={activeFilter}
        searchTerm={search}
        onSearchChange={setSearch}
        reallocationData={reallocProcessed}
      />
    </div>
  );
};

export default DispatchPage;
