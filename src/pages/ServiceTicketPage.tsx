import React, { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { patchDispatch } from "@/lib/firebase";
import { formatDateTime, formatElapsedTime } from "@/lib/time";
import type { ProcessedDispatchEntry } from "@/types";
import { useDashboardContext } from "./Index";

const resolveVinNumber = (entry: ProcessedDispatchEntry) =>
  entry["Vin Number"] ?? (entry as Record<string, any>)["VIN Number"] ?? "";

const ServiceTicketPage: React.FC = () => {
  const { dispatchProcessed } = useDashboardContext();
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const serviceTickets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return dispatchProcessed
      .filter((entry) => entry.ServiceTicket)
      .filter((entry) => {
        if (!term) return true;
        const values = [
          entry["Chassis No"],
          entry["SO Number"],
          resolveVinNumber(entry),
          entry.Customer,
          entry.Model,
        ];
        return values.some((value) =>
          value != null && String(value).toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const aTime = a.ServiceTicketAt ? new Date(a.ServiceTicketAt).getTime() : 0;
        const bTime = b.ServiceTicketAt ? new Date(b.ServiceTicketAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [dispatchProcessed, searchTerm]);

  const handleMarkReady = async (dispatchKey: string) => {
    if (!dispatchKey) return;
    setSaving((prev) => ({ ...prev, [dispatchKey]: true }));
    try {
      await patchDispatch(dispatchKey, {
        ServiceTicket: false,
        ServiceTicketAt: null,
        ServiceTicketBy: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : null;
      toast.error(message ? `Failed to update service ticket: ${message}` : "Failed to update service ticket.");
    } finally {
      setSaving((prev) => ({ ...prev, [dispatchKey]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Service Ticket</CardTitle>
            <Input
              placeholder="Search chassis, customer, model..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full sm:w-72"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Chassis No</TableHead>
                  <TableHead className="min-w-[130px]">SO Number</TableHead>
                  <TableHead className="min-w-[150px]">VIN Number</TableHead>
                  <TableHead className="min-w-[160px]">Customer</TableHead>
                  <TableHead className="min-w-[120px]">Model</TableHead>
                  <TableHead className="min-w-[200px]">Service ticket at</TableHead>
                  <TableHead className="min-w-[180px]">Service duration</TableHead>
                  <TableHead className="min-w-[240px]">Comment</TableHead>
                  <TableHead className="min-w-[180px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceTickets.map((entry, index) => {
                  const dispatchKey = entry.dispatchKey || entry["Chassis No"] || "";
                  const chassisNo = entry["Chassis No"] || dispatchKey;
                  return (
                    <TableRow
                      key={chassisNo || index}
                      className={index % 2 ? "bg-white" : "bg-slate-50/50"}
                    >
                      <TableCell className="font-medium">{chassisNo || "-"}</TableCell>
                      <TableCell>{entry["SO Number"] || "-"}</TableCell>
                      <TableCell>{resolveVinNumber(entry) || "-"}</TableCell>
                      <TableCell>{entry.Customer || "-"}</TableCell>
                      <TableCell>{entry.Model || "-"}</TableCell>
                      <TableCell>{formatDateTime(entry.ServiceTicketAt)}</TableCell>
                      <TableCell>{formatElapsedTime(entry.ServiceTicketAt)}</TableCell>
                      <TableCell>{entry.Comment || "-"}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white"
                          disabled={saving[dispatchKey]}
                          onClick={() => handleMarkReady(dispatchKey)}
                        >
                          Service Get Ready
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!serviceTickets.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-sm text-slate-500">
                      No service tickets found.
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

export default ServiceTicketPage;
