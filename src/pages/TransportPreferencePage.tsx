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

const isYes = (value?: string | null) => (value || "").trim().toLowerCase() === "yes";

const renderStars = (score?: string | number | null) => {
  const numeric =
    typeof score === "number"
      ? score
      : Number.parseFloat(score == null ? "" : String(score));
  if (!Number.isFinite(numeric)) return <span className="text-xs text-slate-400">-</span>;
  const normalized = Math.max(0, Math.min(5, (numeric / 10) * 5));
  const percent = Math.round((normalized / 5) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="relative text-sm leading-none text-slate-200">
        <span>★★★★★</span>
        <span className="absolute inset-0 overflow-hidden text-amber-400" style={{ width: `${percent}%` }}>
          ★★★★★
        </span>
      </div>
      <span className="text-xs font-semibold text-slate-600">{numeric.toFixed(1)}</span>
    </div>
  );
};

type DealerFormState = {
  order: string;
  vendorName: string;
  truckNumber: string;
  supplierRating: string;
  bankGuarantee: boolean;
  editingIndex: number | null;
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
  const [dealerQuery, setDealerQuery] = useState("");
  const [newDealerName, setNewDealerName] = useState("");
  const [newDealerDestination, setNewDealerDestination] = useState("");
  const [dealerForms, setDealerForms] = useState<Record<string, DealerFormState>>({});

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

  const filteredPreferenceEntries = useMemo(() => {
    const query = dealerQuery.trim().toLowerCase();
    if (!query) return preferenceEntries;
    return preferenceEntries.filter((entry) => entry.dealer.toLowerCase().includes(query));
  }, [dealerQuery, preferenceEntries]);

  const defaultDealerForm: DealerFormState = {
    order: "",
    vendorName: "",
    truckNumber: "",
    supplierRating: "",
    bankGuarantee: false,
    editingIndex: null,
  };

  const clonePreferenceData = (data: TransportPreferenceData): TransportPreferenceData => {
    const next: TransportPreferenceData = {};
    Object.entries(data || {}).forEach(([dealer, entry]) => {
      next[dealer] = {
        destination: entry.destination ?? null,
        preferences: (entry.preferences || []).map((pref) => ({ ...pref })),
      };
    });
    return next;
  };

  const updateDealerForm = (dealer: string, patch: Partial<DealerFormState>) => {
    setDealerForms((prev) => ({
      ...prev,
      [dealer]: {
        ...defaultDealerForm,
        ...prev[dealer],
        ...patch,
      },
    }));
  };

  const resetDealerForm = (dealer: string) => {
    setDealerForms((prev) => ({
      ...prev,
      [dealer]: { ...defaultDealerForm },
    }));
  };

  const handleAddDealer = async () => {
    const name = newDealerName.trim();
    if (!name) {
      toast.error("Please enter a dealer name.");
      return;
    }
    const existing = Object.keys(transportPreferences || {}).find(
      (dealer) => dealer.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      toast.error("Dealer already exists.");
      return;
    }

    const next = clonePreferenceData(transportPreferences || {});
    next[name] = {
      destination: newDealerDestination.trim() || null,
      preferences: [],
    };

    try {
      await handleSaveTransportPreferences(next);
      toast.success(`Dealer ${name} added.`);
      setNewDealerName("");
      setNewDealerDestination("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add dealer.";
      toast.error(message);
    }
  };

  const handleSaveVendor = async (
    dealer: string,
    preferences: TransportPreferenceItem[]
  ) => {
    const form = dealerForms[dealer] ?? defaultDealerForm;
    const vendorName = form.vendorName.trim();
    if (!vendorName) {
      toast.error("Please enter a vendor name.");
      return;
    }

    const orderValue = form.order.trim();
    const order = orderValue
      ? Number.parseInt(orderValue, 10)
      : preferences.length + 1;

    if (!Number.isFinite(order) || order < 1 || order > MAX_PREFERENCES) {
      toast.error(`Order must be between 1 and ${MAX_PREFERENCES}.`);
      return;
    }

    const vendorId = transportIdByName.get(vendorName.toLowerCase()) || null;
    const nextPreference: TransportPreferenceItem = {
      order,
      vendorId,
      vendorName,
      truckNumber: form.truckNumber.trim() || null,
      supplierRating: form.supplierRating.trim() || null,
      bankGuarantee: form.bankGuarantee ? "Yes" : null,
    };

    const next = clonePreferenceData(transportPreferences || {});
    const entry = next[dealer] || { destination: null, preferences: [] };
    const nextPreferences = preferences.slice();

    if (form.editingIndex != null) {
      nextPreferences[form.editingIndex] = nextPreference;
    } else {
      nextPreferences.push(nextPreference);
    }

    entry.preferences = nextPreferences
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    next[dealer] = entry;

    try {
      await handleSaveTransportPreferences(next);
      toast.success(form.editingIndex != null ? "Vendor updated." : "Vendor added.");
      resetDealerForm(dealer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save vendor.";
      toast.error(message);
    }
  };

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
            Manage dealer preferences via CSV upload or the quick editor below. Uploading replaces the saved data.
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
          <CardTitle className="text-base">Quick manage dealers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600">Search dealer</label>
              <Input
                value={dealerQuery}
                onChange={(event) => setDealerQuery(event.target.value)}
                placeholder="Search dealer name"
                className="w-64"
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600">Add dealer</label>
                <Input
                  value={newDealerName}
                  onChange={(event) => setNewDealerName(event.target.value)}
                  placeholder="Dealer name"
                  list="dealer-options"
                  className="w-56"
                />
                <datalist id="dealer-options">
                  {dealers.map((dealer) => (
                    <option key={dealer} value={dealer} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600">Destination</label>
                <Input
                  value={newDealerDestination}
                  onChange={(event) => setNewDealerDestination(event.target.value)}
                  placeholder="Optional destination"
                  className="w-56"
                />
              </div>
              <Button onClick={handleAddDealer}>Add dealer</Button>
            </div>
          </div>
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
            filteredPreferenceEntries.length ? (
              <div className="space-y-6">
                {filteredPreferenceEntries.map(({ dealer, destination, preferences }) => (
                  <Card key={dealer} className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-slate-900">{dealer}</CardTitle>
                      <p className="text-xs text-muted-foreground">Preference vendors: {preferences.length}</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Basic info</div>
                        <div className="mt-2 text-sm font-medium text-slate-800">
                          Destination: <span className="font-semibold">{destination || "-"}</span>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50">
                              <TableHead className="w-20">Preference</TableHead>
                              <TableHead className="w-56">Vendor</TableHead>
                              <TableHead>Capacity</TableHead>
                              <TableHead>Supplier rating</TableHead>
                              <TableHead>Bank guarantee</TableHead>
                              <TableHead className="w-24">Edit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {preferences.map((pref, index) => {
                              const vendorLabel =
                                pref.vendorName || transportNameById.get(pref.vendorId || "") || "-";
                              return (
                                <TableRow key={`${dealer}-${pref.order}-${index}`}>
                                  <TableCell className="text-sm font-semibold text-slate-600">
                                    {pref.order ?? index + 1}
                                  </TableCell>
                                  <TableCell className="font-semibold text-slate-900">{vendorLabel}</TableCell>
                                  <TableCell>
                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                                      {pref.truckNumber || "-"}
                                    </span>
                                  </TableCell>
                                  <TableCell>{renderStars(pref.supplierRating)}</TableCell>
                                  <TableCell>
                                    {isYes(pref.bankGuarantee) ? (
                                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                                        Bank guarantee
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-400">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        updateDealerForm(dealer, {
                                          editingIndex: index,
                                          order: String(pref.order ?? index + 1),
                                          vendorName: vendorLabel === "-" ? "" : vendorLabel,
                                          truckNumber: pref.truckNumber ?? "",
                                          supplierRating: pref.supplierRating ?? "",
                                          bankGuarantee: isYes(pref.bankGuarantee),
                                        })
                                      }
                                    >
                                      Edit
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {(() => {
                        const form = dealerForms[dealer] ?? defaultDealerForm;
                        const isEditing = form.editingIndex != null;
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {isEditing ? "Edit vendor" : "Add vendor"}
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-5">
                              <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-semibold text-slate-600">Vendor name</label>
                                <Input
                                  value={form.vendorName}
                                  onChange={(event) =>
                                    updateDealerForm(dealer, { vendorName: event.target.value })
                                  }
                                  placeholder="Select or type vendor"
                                  list={`vendor-options-${dealer}`}
                                />
                                <datalist id={`vendor-options-${dealer}`}>
                                  {transportOptions.map((option) => (
                                    <option key={option.id} value={option.name} />
                                  ))}
                                </datalist>
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600">Order</label>
                                <Input
                                  value={form.order}
                                  onChange={(event) => updateDealerForm(dealer, { order: event.target.value })}
                                  placeholder="1-8"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600">Capacity</label>
                                <Input
                                  value={form.truckNumber}
                                  onChange={(event) =>
                                    updateDealerForm(dealer, { truckNumber: event.target.value })
                                  }
                                  placeholder="Truck count"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600">Supplier rating</label>
                                <Input
                                  value={form.supplierRating}
                                  onChange={(event) =>
                                    updateDealerForm(dealer, { supplierRating: event.target.value })
                                  }
                                  placeholder="0-10"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600">Bank guarantee</label>
                                <select
                                  value={form.bankGuarantee ? "yes" : "no"}
                                  onChange={(event) =>
                                    updateDealerForm(dealer, { bankGuarantee: event.target.value === "yes" })
                                  }
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                  <option value="no">No</option>
                                  <option value="yes">Yes</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button onClick={() => handleSaveVendor(dealer, preferences)}>
                                {isEditing ? "Update vendor" : "Add vendor"}
                              </Button>
                              {isEditing ? (
                                <Button
                                  variant="outline"
                                  onClick={() => resetDealerForm(dealer)}
                                >
                                  Cancel
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No dealers match the current search.
              </div>
            )
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
