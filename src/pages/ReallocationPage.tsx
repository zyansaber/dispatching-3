import React, { useState } from "react";
import { ReallocationTable } from "@/components/DataTables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { useDashboardContext } from "./Index";

const ReallocationPage: React.FC = () => {
  const { reallocProcessed, dispatchProcessed } = useDashboardContext();
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="px-3 py-1 text-xs font-medium">
          {reallocProcessed.length} reallocations
        </Badge>
        <Badge variant="secondary" className="px-3 py-1 text-xs font-medium">
          {dispatchProcessed.length} dispatch rows
        </Badge>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Reallocation Insights</CardTitle>
          <CardDescription>Cross-reference reallocations with dispatch data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Search by chassis, customer, model, or issue.</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reallocation records"
                className="w-64"
              />
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                Clear
              </Button>
            </div>
          </div>

          <ReallocationTable
            data={reallocProcessed}
            searchTerm={search}
            onSearchChange={setSearch}
            dispatchData={dispatchProcessed}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default ReallocationPage;
