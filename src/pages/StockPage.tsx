import React, { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusCheckCategory } from "@/lib/firebase";
import { ProcessedDispatchEntry } from "@/types";
import { useDashboardContext } from "./Index";

const StockPage: React.FC = () => {
  const { dispatchProcessed } = useDashboardContext();
  const [activeFilter, setActiveFilter] = useState<"all" | "booked" | "transportNoPO">("all");

  const allEntries = useMemo(
    () =>
      [...dispatchProcessed].sort((a, b) =>
        (a["Chassis No"] || "").localeCompare(b["Chassis No"] || "")
      ),
    [dispatchProcessed]
  );

  const bookedCount = useMemo(
    () => allEntries.filter((entry) => !!entry.EstimatedPickupAt).length,
    [allEntries]
  );

  const transportNoPOCount = useMemo(
    () =>
      allEntries.filter(
        (entry) => !!entry.EstimatedPickupAt && !entry["Matched PO No"]
      ).length,
    [allEntries]
  );

  const filteredEntries = useMemo(() => {
    if (activeFilter === "booked") {
      return allEntries.filter((entry) => !!entry.EstimatedPickupAt);
    }

    if (activeFilter === "transportNoPO") {
      return allEntries.filter(
        (entry) => !!entry.EstimatedPickupAt && !entry["Matched PO No"]
      );
    }

    return allEntries;
  }, [activeFilter, allEntries]);

  const getStatusMeta = (entry: ProcessedDispatchEntry) => {
    const statusCategory = getStatusCheckCategory(entry.Statuscheck);
    const isSnowyStock =
      entry.reallocatedTo === "Snowy Stock" ||
      entry["Scheduled Dealer"] === "Snowy Stock";

    if (statusCategory === "wrongStatus") {
      return {
        label: "Wrong status",
        badgeClass: "border-rose-300 bg-rose-50 text-rose-700",
        rowClass: "border-l-4 border-rose-300 bg-rose-50/20",
      };
    }

    if (statusCategory === "noReference") {
      return {
        label: "Old van",
        badgeClass: "border-slate-300 bg-slate-50 text-slate-700",
        rowClass: "bg-slate-50",
      };
    }

    if (isSnowyStock) {
      return {
        label: "Snowy stock",
        badgeClass: "border-sky-300 bg-sky-50 text-sky-700",
        rowClass: "bg-sky-50/70",
      };
    }

    if (entry.OnHold) {
      return {
        label: "On hold",
        badgeClass: "border-amber-300 bg-amber-50 text-amber-700",
        rowClass: "bg-amber-50/70",
      };
    }

    if (entry.EstimatedPickupAt) {
      return {
        label: "Booked",
        badgeClass: "border-violet-300 bg-violet-50 text-violet-700",
        rowClass: "bg-violet-50/70",
      };
    }

    if (statusCategory === "ok") {
      return {
        label: "Can dispatch",
        badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-700",
        rowClass: "bg-emerald-50/70",
      };
    }

    return {
      label: "Unknown",
      badgeClass: "border-slate-300 bg-slate-50 text-slate-700",
      rowClass: "",
    };
  };

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
              <CardDescription>All chassis with live dispatch status highlights.</CardDescription>
            </div>
            <Badge variant="secondary" className="px-3 py-1 text-xs font-semibold">
              {allEntries.length} listed
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={activeFilter === "all" ? "default" : "outline"}
              className="flex items-center gap-2"
              onClick={() => setActiveFilter("all")}
            >
              <span>All</span>
              <Badge variant={activeFilter === "all" ? "secondary" : "outline"} className="px-2">
                {allEntries.length}
              </Badge>
            </Button>
            <Button
              size="sm"
              variant={activeFilter === "booked" ? "default" : "outline"}
              className="flex items-center gap-2"
              onClick={() => setActiveFilter("booked")}
            >
              <span>Booked (Transport time)</span>
              <Badge variant={activeFilter === "booked" ? "secondary" : "outline"} className="px-2">
                {bookedCount}
              </Badge>
            </Button>
            <Button
              size="sm"
              variant={activeFilter === "transportNoPO" ? "default" : "outline"}
              className="flex items-center gap-2"
              onClick={() => setActiveFilter("transportNoPO")}
            >
              <span>Transport time, no PO</span>
              <Badge variant={activeFilter === "transportNoPO" ? "secondary" : "outline"} className="px-2">
                {transportNoPOCount}
              </Badge>
            </Button>
          </div>

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
                  <TableHead>PO No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => {
                  const statusMeta = getStatusMeta(entry);
                  return (
                    <TableRow key={entry["Chassis No"]} className={statusMeta.rowClass}>
                      <TableCell className="font-medium">{entry["Chassis No"] || "-"}</TableCell>
                      <TableCell>{entry.Model || "-"}</TableCell>
                      <TableCell>{entry["Scheduled Dealer"] || "-"}</TableCell>
                      <TableCell>{entry.reallocatedTo || "-"}</TableCell>
                      <TableCell>{entry.TransportCompany || "-"}</TableCell>
                      <TableCell>{formatPickup(entry.EstimatedPickupAt)}</TableCell>
                      <TableCell>{entry["Matched PO No"] || "-"}</TableCell>
                      <TableCell>{entry.Customer || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusMeta.badgeClass}>
                          {statusMeta.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filteredEntries.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                      No vehicles match the current filter.
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
