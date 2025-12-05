import React, { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { filterDispatchData } from "@/lib/firebase";
import { useDashboardContext } from "./Index";

const StockPage: React.FC = () => {
  const { dispatchProcessed, reallocRaw } = useDashboardContext();

  const readyToDispatch = useMemo(
    () =>
      filterDispatchData(dispatchProcessed, "canBeDispatched", reallocRaw).sort((a, b) =>
        (a["Chassis No"] || "").localeCompare(b["Chassis No"] || "")
      ),
    [dispatchProcessed, reallocRaw]
  );

  const formatPickup = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Stock Sheet</CardTitle>
              <CardDescription>Vehicles that can dispatch right now.</CardDescription>
            </div>
            <Badge variant="secondary" className="px-3 py-1 text-xs font-semibold">
              {readyToDispatch.length} ready
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Chassis No</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Scheduled Dealer</TableHead>
                  <TableHead>Reallocation</TableHead>
                  <TableHead>Transport Company</TableHead>
                  <TableHead>Transport Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyToDispatch.map((entry) => (
                  <TableRow key={entry["Chassis No"]}>
                    <TableCell className="font-medium">{entry["Chassis No"] || "-"}</TableCell>
                    <TableCell>{entry.Model || "-"}</TableCell>
                    <TableCell>{entry["Scheduled Dealer"] || "-"}</TableCell>
                    <TableCell>{entry.reallocatedTo || "-"}</TableCell>
                    <TableCell>{entry.TransportCompany || "-"}</TableCell>
                    <TableCell>{formatPickup(entry.EstimatedPickupAt)}</TableCell>
                    <TableCell>{entry.Customer || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                        Can dispatch
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!readyToDispatch.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                      No vehicles are ready for dispatch yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StockPage;
