import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { subscribePgiRecords, storage } from "@/lib/firebase";
import type { PgiRecordData, PgiRecordEntry } from "@/types";
import { getDownloadURL, listAll, ref as storageRef } from "firebase/storage";

type PgiHistoryRow = PgiRecordEntry & {
  chassisNumber: string;
  entryId?: string;
};

type DeliveryDoc = {
  name: string;
  url: string;
  fullPath: string;
};

const isRecordEntry = (value: unknown): value is PgiRecordEntry => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return [
    "dealer",
    "poNumber",
    "vendorName",
    "grStatus",
    "grDateLast",
    "customer",
    "model",
    "pgidate",
    "vinNumber",
  ].some((key) => key in candidate);
};

const flattenPgiRecords = (data: PgiRecordData) => {
  const rows: PgiHistoryRow[] = [];

  Object.entries(data || {}).forEach(([chassisNumber, entries]) => {
    if (isRecordEntry(entries)) {
      rows.push({ chassisNumber, ...entries });
      return;
    }

    if (!entries || typeof entries !== "object") return;
    Object.entries(entries).forEach(([entryId, entry]) => {
      if (!isRecordEntry(entry)) return;
      rows.push({
        chassisNumber,
        entryId,
        ...entry,
      });
    });
  });

  return rows;
};

const formatPrice = (value?: number | string | null) => {
  if (value == null || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const PGIHistoryPage: React.FC = () => {
  const [records, setRecords] = useState<PgiHistoryRow[]>([]);
  const [deliveryDocs, setDeliveryDocs] = useState<DeliveryDoc[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = subscribePgiRecords((data: PgiRecordData) => {
      const rows = flattenPgiRecords(data);
      rows.sort((a, b) => (a.chassisNumber || "").localeCompare(b.chassisNumber || ""));
      setRecords(rows);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchDocs = async () => {
      setIsLoadingDocs(true);
      try {
        const folderRef = storageRef(storage, "deliverydoc");
        const list = await listAll(folderRef);
        const docs = await Promise.all(
          list.items.map(async (item) => ({
            name: item.name,
            fullPath: item.fullPath,
            url: await getDownloadURL(item),
          }))
        );
        if (isMounted) {
          setDeliveryDocs(docs);
        }
      } catch (error) {
        console.error("Failed to load delivery docs", error);
      } finally {
        if (isMounted) {
          setIsLoadingDocs(false);
        }
      }
    };
    fetchDocs();
    return () => {
      isMounted = false;
    };
  }, []);

  const docsByChassis = useMemo(() => {
    const map = new Map<string, DeliveryDoc[]>();
    records.forEach((record) => {
      const chassis = record.chassisNumber;
      if (!chassis || map.has(chassis)) return;
      const matches = deliveryDocs.filter((doc) => doc.name.includes(chassis));
      if (matches.length) map.set(chassis, matches);
    });
    return map;
  }, [deliveryDocs, records]);

  return (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">PGI History</CardTitle>
          <CardDescription>
            PGI records with delivery documents from Firebase storage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chassis Number</TableHead>
                  <TableHead>Dealer</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Vendor Name</TableHead>
                  <TableHead className="text-right">PO Price</TableHead>
                  <TableHead>GR Status</TableHead>
                  <TableHead>GR Date</TableHead>
                  <TableHead>Delivery Doc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                      No PGI records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => {
                    const docs = docsByChassis.get(record.chassisNumber) || [];
                    return (
                      <TableRow key={`${record.chassisNumber}-${record.entryId ?? "root"}`}>
                        <TableCell className="font-medium">{record.chassisNumber || "-"}</TableCell>
                        <TableCell>{record.dealer || "-"}</TableCell>
                        <TableCell>{record.poNumber || "-"}</TableCell>
                        <TableCell>{record.vendorName || "-"}</TableCell>
                        <TableCell className="text-right">{formatPrice(record.poPrice)}</TableCell>
                        <TableCell>{record.grStatus || "-"}</TableCell>
                        <TableCell>{record.grDateLast || "-"}</TableCell>
                        <TableCell>
                          {docs.length > 0 ? (
                            <div className="flex flex-col gap-2">
                              {docs.map((doc) => (
                                <Button
                                  key={doc.fullPath}
                                  variant="outline"
                                  size="sm"
                                  asChild
                                  className="justify-start"
                                >
                                  <a href={doc.url} target="_blank" rel="noreferrer">
                                    {doc.name}
                                  </a>
                                </Button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {isLoadingDocs ? "Loading..." : "No file"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PGIHistoryPage;
