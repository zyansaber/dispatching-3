import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useDashboardContext } from "./Index";
import type { TransportPreferenceData, TransportPreferenceItem } from "@/types";

const MAX_PREFERENCES = 8;
const TEMPLATE_HEADERS = [
  "Dealer",
  "Destination",
  "PreferenceOrder",
  "TransportCompanyId",
  "TransportCompanyName",
  "TruckNumber",
  "SupplierRating",
  "BankGuarantee",
];

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
};

const toCsvValue = (value: string) => {
  if (!value) return "";
  const escaped = value.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
};

const TransportPreferencePage: React.FC = () => {
  const {
    dispatchProcessed,
    transportCompanies,
    transportPreferences,
    handleSaveTransportPreferences,
  } = useDashboardContext();
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const transportOptions = useMemo(
    () =>
      Object.entries(transportCompanies || {})
        .map(([id, company]) => ({
          id,
          name: company.name,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [transportCompanies]
  );

  const transportNameById = useMemo(() => {
    const map = new Map<string, string>();
    transportOptions.forEach((option) => map.set(option.id, option.name));
    return map;
  }, [transportOptions]);

  const transportIdByName = useMemo(() => {
    const map = new Map<string, string>();
    transportOptions.forEach((option) => map.set(option.name.toLowerCase(), option.id));
    return map;
  }, [transportOptions]);

  const dealers = useMemo(() => {
    const set = new Set<string>();
    dispatchProcessed.forEach((entry) => {
      const scheduledDealer = entry["Scheduled Dealer"];
      if (typeof scheduledDealer === "string" && scheduledDealer.trim()) {
        set.add(scheduledDealer.trim());
      }
      if (typeof entry.reallocatedTo === "string" && entry.reallocatedTo.trim()) {
        set.add(entry.reallocatedTo.trim());
      }
    });
    return Array.from(set).filter((dealer) => dealer !== "Snowy Stock").sort();
  }, [dispatchProcessed]);

  const preferenceEntries = useMemo(() => {
    const data = transportPreferences || {};
    return Object.entries(data)
      .map(([dealer, entry]) => {
        const preferences = (entry.preferences || [])
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return { dealer, destination: entry.destination || "", preferences };
      })
      .sort((a, b) => a.dealer.localeCompare(b.dealer));
  }, [transportPreferences]);

  const handleDownloadTemplate = () => {
    const rows: string[] = [];
    dealers.forEach((dealer) => {
      for (let order = 1; order <= MAX_PREFERENCES; order += 1) {
        rows.push(
          [
            dealer,
            "",
            String(order),
            "",
            "",
            "",
            "",
            "",
          ]
            .map(toCsvValue)
            .join(",")
        );
      }
    });

    const csvContent = [TEMPLATE_HEADERS.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transport-preference-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parseUploadedCsv = async (file: File): Promise<TransportPreferenceData> => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (!lines.length) return {};

    const headers = parseCSVLine(lines[0]).map((header) => header.trim().toLowerCase());
    const getIndex = (name: string) => headers.indexOf(name.toLowerCase());

    const dealerIndex = getIndex("dealer");
    const destinationIndex = getIndex("destination");
    const orderIndex = getIndex("preferenceorder");
    const vendorIdIndex = getIndex("transportcompanyid");
    const vendorNameIndex = getIndex("transportcompanyname");
    const truckIndex = getIndex("trucknumber");
    const ratingIndex = getIndex("supplierrating");
    const guaranteeIndex = getIndex("bankguarantee");

    if (dealerIndex < 0 || orderIndex < 0) {
      throw new Error("CSV header must include Dealer and PreferenceOrder columns.");
    }

    const data: TransportPreferenceData = {};

    lines.slice(1).forEach((line) => {
      const cols = parseCSVLine(line);
      const dealer = (cols[dealerIndex] || "").trim();
      if (!dealer) return;

      const orderRaw = cols[orderIndex]?.trim() || "";
      const order = Number.parseInt(orderRaw, 10);
      if (!Number.isFinite(order) || order < 1 || order > MAX_PREFERENCES) return;

      const destination = destinationIndex >= 0 ? cols[destinationIndex]?.trim() : "";
      const vendorId = vendorIdIndex >= 0 ? cols[vendorIdIndex]?.trim() : "";
      const vendorNameRaw = vendorNameIndex >= 0 ? cols[vendorNameIndex]?.trim() : "";
      const vendorName = vendorNameRaw || (vendorId ? transportNameById.get(vendorId) || "" : "");
      const resolvedVendorId = vendorId || (vendorName ? transportIdByName.get(vendorName.toLowerCase()) || "" : "");

      const pref: TransportPreferenceItem = {
        order,
        vendorId: resolvedVendorId || null,
        vendorName: vendorName || null,
        truckNumber: truckIndex >= 0 ? cols[truckIndex]?.trim() : "",
        supplierRating: ratingIndex >= 0 ? cols[ratingIndex]?.trim() : "",
        bankGuarantee: guaranteeIndex >= 0 ? cols[guaranteeIndex]?.trim() : "",
      };

      if (!data[dealer]) {
        data[dealer] = {
          destination: destination || null,
          preferences: [pref],
        };
      } else {
        if (destination && !data[dealer].destination) {
          data[dealer].destination = destination;
        }
        data[dealer].preferences = [...(data[dealer].preferences || []), pref];
      }
    });

    Object.values(data).forEach((entry) => {
      entry.preferences = (entry.preferences || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });

    return data;
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a CSV file to upload.");
      return;
    }

    setUploading(true);
    try {
      const data = await parseUploadedCsv(selectedFile);
      await handleSaveTransportPreferences(data);
      toast.success("Transport preferences uploaded successfully.");
      setSelectedFile(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload preferences.";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Transport Preference</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preferences are managed only via CSV download/upload. Uploading replaces the saved data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{dealers.length} dealers</Badge>
          <Badge variant="secondary">{transportOptions.length} transport companies</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Download & Upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download template
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept=".csv"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                className="w-72"
              />
              <Button onClick={handleUpload} disabled={uploading || !selectedFile}>
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? "Uploading..." : "Upload CSV"}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Transport companies must exist in Admin before they can be referenced by ID or name.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Current preferences</CardTitle>
            <FileDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {preferenceEntries.length ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-48">Dealer</TableHead>
                    <TableHead className="w-48">Destination</TableHead>
                    <TableHead className="w-20">Pref</TableHead>
                    <TableHead className="w-56">Vendor</TableHead>
                    <TableHead>Truck no.</TableHead>
                    <TableHead>Supplier rating</TableHead>
                    <TableHead>Bank guarantee</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preferenceEntries.flatMap(({ dealer, destination, preferences }) =>
                    preferences.map((pref, index) => {
                      const vendorLabel = pref.vendorName || transportNameById.get(pref.vendorId || "") || "-";
                      return (
                        <TableRow key={`${dealer}-${pref.order}-${index}`}>
                          <TableCell className="font-medium text-slate-700">{dealer}</TableCell>
                          <TableCell>{destination || "-"}</TableCell>
                          <TableCell>#{pref.order ?? index + 1}</TableCell>
                          <TableCell>{vendorLabel}</TableCell>
                          <TableCell>{pref.truckNumber || "-"}</TableCell>
                          <TableCell>{pref.supplierRating || "-"}</TableCell>
                          <TableCell>{pref.bankGuarantee || "-"}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No transport preferences uploaded yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TransportPreferencePage;
