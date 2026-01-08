import React, { useState } from "react";
import { ReallocationTable } from "@/components/DataTables";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "./Index";

const ReallocationPage: React.FC = () => {
  const { reallocProcessed, dispatchProcessed } = useDashboardContext();
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Reallocation Insights</CardTitle>
          <CardDescription>Cross-reference reallocations with dispatch data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
