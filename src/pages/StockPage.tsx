import React, { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProcessedDispatchEntry } from "@/types";
import { useDashboardContext } from "./Index";

const StockPage: React.FC = () => {
  const { dispatchProcessed } = useDashboardContext();
  const [activeFilter, setActiveFilter] = useState<"all" | "booked" | "transportNoPO">("all");

  const hasMatchedPO = useCallback((entry: ProcessedDispatchEntry) => {
    const poNo = entry["Matched PO No"];
    return typeof poNo === "string" ? poNo.trim().length > 0 : Boolean(poNo);
  }, []);

  const hasTransportInfo = useCallback((entry: ProcessedDispatchEntry) => {
    const company = entry.TransportCompany;
    const hasCompany = typeof company === "string" ? company.trim().length > 0 : Boolean(company);
    return hasCompany || Boolean(entry.EstimatedPickupAt);
  }, []);

  const allEntries = useMemo(() => {
    const entries = [...dispatchProcessed];
    const statusOrder = new Map<string, number>([
      ["Booked", 0],
      ["Waiting for booking", 1],
      ["Snowy stock", 2],
      ["On Hold", 3],
      ["Temporary leaving", 4],
      ["Invalid stock (to be confirmed)", 5],
    ]);

    const getStatusLabel = (entry: ProcessedDispatchEntry) => {
      const isSnowyStock =
        entry.reallocatedTo === "Snowy Stock" ||
        entry["Scheduled Dealer"] === "Snowy Stock";

      if (entry.OnHold) return "On Hold";
      if (entry.TemporaryLeavingWithoutPGI) return "Temporary leaving";
      if (entry.InvalidStock) return "Invalid stock (to be confirmed)";
      if (isSnowyStock) return "Snowy stock";
      if (hasMatchedPO(entry)) return "Booked";
      return "Waiting for booking";
    };

    const getStatusRank = (entry: ProcessedDispatchEntry) =>
      statusOrder.get(getStatusLabel(entry)) ?? 99;

    return entries.sort((a, b) => {
      const statusDiff = getStatusRank(a) - getStatusRank(b);
      if (statusDiff !== 0) return statusDiff;
      return (a["Chassis No"] || "").localeCompare(b["Chassis No"] || "");
    });
  }, [dispatchProcessed, hasMatchedPO]);

  const bookedCount = useMemo(
    () => allEntries.filter((entry) => hasMatchedPO(entry)).length,
    [allEntries, hasMatchedPO]
  );

  const transportNoPOCount = useMemo(
    () =>
      allEntries.filter(
        (entry) => hasTransportInfo(entry) && !hasMatchedPO(entry)
      ).length,
    [allEntries, hasMatchedPO, hasTransportInfo]
  );

  const filteredEntries = useMemo(() => {
    if (activeFilter === "booked") {
      return allEntries.filter((entry) => hasMatchedPO(entry));
    }

    if (activeFilter === "transportNoPO") {
      return allEntries.filter(
        (entry) => hasTransportInfo(entry) && !hasMatchedPO(entry)
      );
    }

    return allEntries;
  }, [activeFilter, allEntries, hasMatchedPO, hasTransportInfo]);

  const getStatusMeta = (entry: ProcessedDispatchEntry) => {
    const isSnowyStock =
      entry.reallocatedTo === "Snowy Stock" ||
      entry["Scheduled Dealer"] === "Snowy Stock";

    if (entry.OnHold) {
      return {
        label: "On Hold",
        badgeClass: "border-amber-300 bg-amber-50 text-amber-700",
      };
    }

    if (entry.TemporaryLeavingWithoutPGI) {
      return {
        label: "Temporary leaving",
        badgeClass: "border-orange-300 bg-orange-50 text-orange-700",
      };
    }

    if (entry.InvalidStock) {
      return {
        label: "Invalid stock (to be confirmed)",
        badgeClass: "border-yellow-300 bg-yellow-50 text-yellow-700",
      };
    }

    if (isSnowyStock) {
      return {
        label: "Snowy stock",
        badgeClass: "border-sky-300 bg-sky-50 text-sky-700",
      };
    }

    if (hasMatchedPO(entry)) {
      return {
        label: "Booked",
        badgeClass: "border-violet-300 bg-violet-50 text-violet-700",
      };
    }

    return {
      label: "Waiting for booking",
      badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-700",
    };
  };

  const formatPickup = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  const toCsvCell = (value?: string | number | boolean | null) => {
    if (value == null) return "";
    const stringValue = String(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, "\"\"")}"`;
    }
    return stringValue;
  };

  const handleDownloadList = () => {
    const headers = [
      "Chassis No",
      "Model",
      "Scheduled Dealer",
      "Reallocation",
      "Transport Company",
      "Transport Time",
      "GR to GI Days",
      "PO No",
      "Customer",
      "Status",
      "Comment",
    ];

    const rows = allEntries.map((entry) => {
      const statusMeta = getStatusMeta(entry);
      return [
        entry["Chassis No"] || "",
        entry.Model || "",
        entry["Scheduled Dealer"] || "",
        entry.reallocatedTo || "",
        entry.TransportCompany || "",
        formatPickup(entry.EstimatedPickupAt),
        entry["GR to GI Days"] ?? "",
        entry["Matched PO No"] || "",
        entry.Customer || "",
        statusMeta.label,
        entry.Comment || "",
      ];
    });

    const content = [headers, ...rows]
      .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
      .join("\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stock_sheet_list.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
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
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-3 py-1 text-xs font-semibold">
                {allEntries.length} listed
              </Badge>
              <Button size="sm" variant="outline" onClick={handleDownloadList}>
                Download List
              </Button>
            </div>
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
              <span>Booked (PO No)</span>
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
                  <TableHead>SO Number</TableHead>
                  <TableHead>VIN Number</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Scheduled Dealer</TableHead>
                  <TableHead>Reallocation</TableHead>
                  <TableHead>Transport Company</TableHead>
                  <TableHead>Transport Time</TableHead>
                  <TableHead>GR to GI Days</TableHead>
                  <TableHead>PO No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => {
                  const statusMeta = getStatusMeta(entry);
                  const grToGiDays = entry["GR to GI Days"];
                  return (
                    <TableRow key={entry["Chassis No"]}>
                      <TableCell className="font-medium">{entry["Chassis No"] || "-"}</TableCell>
                      <TableCell>{entry["SO Number"] || "-"}</TableCell>
                      <TableCell>{entry["Vin Number"] || (entry as Record<string, any>)["VIN Number"] || "-"}</TableCell>
                      <TableCell>{entry.Model || "-"}</TableCell>
                      <TableCell>{entry["Scheduled Dealer"] || "-"}</TableCell>
                      <TableCell>{entry.reallocatedTo || "-"}</TableCell>
                      <TableCell>{entry.TransportCompany || "-"}</TableCell>
                      <TableCell>{formatPickup(entry.EstimatedPickupAt)}</TableCell>
                      <TableCell>{grToGiDays ?? "-"}</TableCell>
                      <TableCell>{entry["Matched PO No"] || "-"}</TableCell>
                      <TableCell>{entry.Customer || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusMeta.badgeClass}>
                          {statusMeta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="bg-amber-50 text-amber-900 font-medium">
                        {entry.Comment || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filteredEntries.length && (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-sm text-muted-foreground">
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
