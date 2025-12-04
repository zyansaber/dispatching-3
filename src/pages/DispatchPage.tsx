import React, { useState } from "react";
import { DispatchStats, DispatchTable } from "@/components/DataTables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { useDashboardContext } from "./Index";

const DispatchPage: React.FC = () => {
  const { dispatchProcessed, reallocProcessed, stats } = useDashboardContext();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "invalid" | "snowy" | "canBeDispatched" | "onHold">(
    "all"
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
          <span>Use the summary cards or search box to focus on the right queue.</span>
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
