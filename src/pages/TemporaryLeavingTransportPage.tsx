import React, { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { patchDispatch } from "@/lib/firebase";
import { useDashboardContext } from "./Index";
import { toast } from "sonner";

const TemporaryLeavingTransportPage: React.FC = () => {
  const { dispatchProcessed } = useDashboardContext();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const temporaryLeavingEntries = useMemo(
    () =>
      dispatchProcessed
        .filter((entry) => entry.TemporaryLeavingWithoutPGI)
        .sort((a, b) => (a["Chassis No"] || "").localeCompare(b["Chassis No"] || "")),
    [dispatchProcessed]
  );

  const grouped = useMemo(() => {
    const showLeaving: typeof temporaryLeavingEntries = [];
    const standardLeaving: typeof temporaryLeavingEntries = [];

    temporaryLeavingEntries.forEach((entry) => {
      const note = entry.Comment || "";
      if (/show/i.test(note)) {
        showLeaving.push(entry);
      } else {
        standardLeaving.push(entry);
      }
    });

    return { showLeaving, standardLeaving };
  }, [temporaryLeavingEntries]);

  const hasDirectToPgi = useMemo(
    () => temporaryLeavingEntries.some((entry) => entry.TemporaryLeavingDirectToPGI),
    [temporaryLeavingEntries]
  );

  const handleToggle = async (
    chassisNo: string,
    field: "TemporaryLeavingReturnFactory" | "TemporaryLeavingDirectToPGI",
    checked: boolean
  ) => {
    setSavingKey(chassisNo + field);
    try {
      if (field === "TemporaryLeavingReturnFactory") {
        const payload: Record<string, string | boolean | null> = {
          TemporaryLeavingReturnFactory: checked,
          TemporaryLeavingReturnFactoryAt: checked ? new Date().toISOString() : null,
        };
        if (checked) {
          payload.TemporaryLeavingDirectToPGI = false;
          payload.TemporaryLeavingDirectToPGIAt = null;
        } else {
          payload.TemporaryLeavingReturnPO = null;
        }
        await patchDispatch(chassisNo, payload);
      } else {
        const payload: Record<string, string | boolean | null> = {
          TemporaryLeavingDirectToPGI: checked,
          TemporaryLeavingDirectToPGIAt: checked ? new Date().toISOString() : null,
        };
        if (checked) {
          payload.TemporaryLeavingReturnFactory = false;
          payload.TemporaryLeavingReturnFactoryAt = null;
          payload.TemporaryLeavingReturnPO = null;
        }
        await patchDispatch(chassisNo, payload);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update option.");
    } finally {
      setSavingKey(null);
    }
  };

  const handleReturnPoChange = async (chassisNo: string, value: string) => {
    setSavingKey(chassisNo + "returnPO");
    try {
      await patchDispatch(chassisNo, {
        TemporaryLeavingReturnPO: value.trim() || null,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save return PO.");
    } finally {
      setSavingKey(null);
    }
  };

  const handleReceived = async (chassisNo: string) => {
    setSavingKey(chassisNo + "received");
    try {
      await patchDispatch(chassisNo, {
        TemporaryLeavingWithoutPGI: false,
        TemporaryLeavingWithoutPGIAt: null,
        TemporaryLeavingWithoutPGIBy: null,
        TemporaryLeavingReturnFactory: false,
        TemporaryLeavingReturnFactoryAt: null,
        TemporaryLeavingReturnPO: null,
        TemporaryLeavingDirectToPGI: false,
        TemporaryLeavingDirectToPGIAt: null,
      });
      toast.success(`${chassisNo} returned to Waiting for booking.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark received.");
    } finally {
      setSavingKey(null);
    }
  };

  const renderSection = (title: string, entries: typeof temporaryLeavingEntries) => (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{entries.length} vehicle(s)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chassis No</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Leaving PO</TableHead>
                <TableHead>Return factory</TableHead>
                <TableHead>Direct to PGI</TableHead>
                <TableHead>Return PO</TableHead>
                <TableHead>Received</TableHead>
                {hasDirectToPgi && <TableHead>Direct to PGI status</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const chassisNo = entry["Chassis No"] || "";
                const isReturnFactory = Boolean(entry.TemporaryLeavingReturnFactory);
                const isDirectToPgi = Boolean(entry.TemporaryLeavingDirectToPGI);
                return (
                  <TableRow key={chassisNo}>
                    <TableCell className="font-medium">{chassisNo}</TableCell>
                    <TableCell>{entry.Comment || "-"}</TableCell>
                    <TableCell>{entry["Matched PO No"] || "-"}</TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={isReturnFactory}
                        disabled={Boolean(savingKey)}
                        onChange={(event) =>
                          handleToggle(chassisNo, "TemporaryLeavingReturnFactory", event.target.checked)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={isDirectToPgi}
                        disabled={Boolean(savingKey)}
                        onChange={(event) =>
                          handleToggle(chassisNo, "TemporaryLeavingDirectToPGI", event.target.checked)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {isReturnFactory ? (
                        <Input
                          defaultValue={entry.TemporaryLeavingReturnPO || ""}
                          placeholder="Enter return PO"
                          className="min-w-[180px]"
                          onBlur={(event) => handleReturnPoChange(chassisNo, event.target.value)}
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isReturnFactory ? (
                        <Button
                          size="sm"
                          disabled={Boolean(savingKey)}
                          onClick={() => handleReceived(chassisNo)}
                        >
                          Received
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {hasDirectToPgi && (
                      <TableCell>
                        {isDirectToPgi ? (
                          <Badge className="bg-blue-600 text-white hover:bg-blue-600">Direct to PGI</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Temporary Leaving and Transport</CardTitle>
          <CardDescription>
            Vehicles marked as temporary leaving are grouped here. Notes containing “show” are in Show Leaving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 text-sm text-muted-foreground">
            <span>Total: {temporaryLeavingEntries.length}</span>
            <span>Show Leaving: {grouped.showLeaving.length}</span>
            <span>Other Leaving: {grouped.standardLeaving.length}</span>
          </div>
        </CardContent>
      </Card>

      {renderSection("Show Leaving", grouped.showLeaving)}
      {renderSection("Temporary Leaving", grouped.standardLeaving)}
    </div>
  );
};

export default TemporaryLeavingTransportPage;
