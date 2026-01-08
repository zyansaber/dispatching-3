import React, { useEffect, useState } from "react";
import { DispatchStats, DispatchTable } from "@/components/DataTables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { useDashboardContext } from "./Index";

const DispatchPage: React.FC = () => {
  const {
    dispatchProcessed,
    reallocProcessed,
    stats,
    transportCompanies,
    sidebarFilter,
    setSidebarFilter,
  } = useDashboardContext();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "wrongStatus" | "noReference" | "snowy" | "canBeDispatched" | "onHold" | "booked" | "temporaryLeaving" | "invalidStock"
  >(
    "all"
  );

  useEffect(() => {
    if (sidebarFilter?.kind === "grRange") {
      setActiveFilter("canBeDispatched");
    }
  }, [sidebarFilter]);

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
        wrongStatus={stats.wrongStatus}
        noReference={stats.noReference}
        snowyStock={stats.snowyStock}
        canBeDispatched={stats.canBeDispatched}
        onHold={stats.onHold}
        booked={stats.booked}
        temporaryLeavingWithoutPGI={stats.temporaryLeavingWithoutPGI}
        invalidStock={stats.invalidStock}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Use the summary cards or search box to focus on the right queue.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sidebarFilter?.kind === "grRange" && (
            <Badge variant="outline" className="flex items-center gap-2 rounded-full px-3 py-1 text-xs">
              GR Days: {sidebarFilter.label}
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSidebarFilter(null)}>
                ×
              </Button>
            </Badge>
          )}
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
        transportCompanies={transportCompanies}
        grRangeFilter={sidebarFilter?.kind === "grRange" ? sidebarFilter : null}
      />
    </div>
  );
};

export default DispatchPage;
