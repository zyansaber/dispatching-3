import React from "react";
import StockSheetTable from "@/components/StockSheetTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardContext } from "./Index";

const StockPage: React.FC = () => {
  const { dispatchingNote, schedule, reallocRaw, handleSaveDispatchingNote, handleDeleteDispatchingNote } =
    useDashboardContext();

  return (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Stock Sheet</CardTitle>
          <CardDescription>Manage notes, scheduling, and reallocations in the live stock sheet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StockSheetTable
            notes={dispatchingNote}
            schedule={schedule}
            reallocations={reallocRaw}
            onSave={handleSaveDispatchingNote}
            onDelete={handleDeleteDispatchingNote}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">Need dispatch context?</p>
          <p className="text-xs">Jump to the dashboard for filters, stats, and table tools.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href="/dispatch">Go to Dispatch Dashboard</a>
        </Button>
      </div>
    </div>
  );
};

export default StockPage;
