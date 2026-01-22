import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type PeriodFilter = "pgi2026" | "1m" | "3m" | "6m";

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

const parsePgiDate = (value?: string | null) => {
  if (!value) return null;
  const parts = value.trim().split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map((part) => Number.parseInt(part, 10));
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const isNoGrStatus = (value?: string | null) => {
  if (!value) return true;
  return value.toLowerCase().includes("no gr");
};

const PGIHistoryPage: React.FC = () => {
  const [records, setRecords] = useState<PgiHistoryRow[]>([]);
  const [deliveryDocs, setDeliveryDocs] = useState<DeliveryDoc[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(true);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("pgi2026");
  const [vendorFilter, setVendorFilter] = useState<string>("");
  const [dealerFilter, setDealerFilter] = useState<string>("");
  const [onlyNoGr, setOnlyNoGr] = useState<boolean>(false);

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

  const filteredRecords = useMemo(() => {
    const now = new Date();
    const lowerVendor = vendorFilter.trim().toLowerCase();
    const lowerDealer = dealerFilter.trim().toLowerCase();

    return records.filter((record) => {
      if (lowerVendor) {
        const vendor = record.vendorName ? record.vendorName.toLowerCase() : "";
        if (!vendor.includes(lowerVendor)) return false;
      }

      if (lowerDealer) {
        const dealer = record.dealer ? record.dealer.toLowerCase() : "";
        if (!dealer.includes(lowerDealer)) return false;
      }

      if (onlyNoGr && !isNoGrStatus(record.grStatus ? String(record.grStatus) : "")) {
        return false;
      }

      const pgiDate = parsePgiDate(record.pgidate ? String(record.pgidate) : "");
      if (!pgiDate) return false;

      if (periodFilter === "pgi2026") {
        return pgiDate.getFullYear() === 2026;
      }

      const monthsBack = periodFilter === "1m" ? 1 : periodFilter === "3m" ? 3 : 6;
      const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, now.getDate());
      return pgiDate >= cutoff;
    });
  }, [dealerFilter, onlyNoGr, periodFilter, records, vendorFilter]);

  const docsByChassis = useMemo(() => {
    const map = new Map<string, DeliveryDoc[]>();
    filteredRecords.forEach((record) => {
      const chassis = record.chassisNumber;
      if (!chassis || map.has(chassis)) return;
      const matches = deliveryDocs.filter((doc) => doc.name.includes(chassis));
      if (matches.length) map.set(chassis, matches);
    });
    return map;
  }, [deliveryDocs, filteredRecords]);

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
          <div className="flex flex-col gap-4 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Period</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={periodFilter === "pgi2026" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriodFilter("pgi2026")}
                >
                  PGI 2026
                </Button>
                <Button
                  variant={periodFilter === "1m" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriodFilter("1m")}
                >
                  1 Month
                </Button>
                <Button
                  variant={periodFilter === "3m" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriodFilter("3m")}
                >
                  3 Months
                </Button>
                <Button
                  variant={periodFilter === "6m" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriodFilter("6m")}
                >
                  6 Months
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                placeholder="Filter vendor"
                value={vendorFilter}
                onChange={(event) => setVendorFilter(event.target.value)}
              />
              <Input
                placeholder="Filter dealer"
                value={dealerFilter}
                onChange={(event) => setDealerFilter(event.target.value)}
              />
              <Button
                variant={onlyNoGr ? "default" : "outline"}
                onClick={() => setOnlyNoGr((prev) => !prev)}
              >
                GR Status: No GR
              </Button>
            </div>
          </div>
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
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                      No PGI records found for the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record) => {
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
