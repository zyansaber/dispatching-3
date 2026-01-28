import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { useDashboardContext } from "./Index";

const MAX_PREFERENCES = 8;

type PreferenceEntry = {
  id: string;
  vendorId: string;
  truckNumber: string;
  supplierRating: string;
  bankGuarantee: string;
};

type DealerPreference = {
  destination: string;
  preferences: PreferenceEntry[];
};

const createPreference = (): PreferenceEntry => ({
  id: `pref-${Math.random().toString(36).slice(2, 9)}`,
  vendorId: "",
  truckNumber: "",
  supplierRating: "",
  bankGuarantee: "",
});

const TransportPreferencePage: React.FC = () => {
  const { dispatchProcessed, transportCompanies } = useDashboardContext();
  const [dealerPreferences, setDealerPreferences] = useState<Record<string, DealerPreference>>({});

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

  useEffect(() => {
    setDealerPreferences((prev) => {
      const next = { ...prev };
      dealers.forEach((dealer) => {
        if (!next[dealer]) {
          next[dealer] = {
            destination: "",
            preferences: [createPreference()],
          };
        }
      });
      return next;
    });
  }, [dealers]);

  const handleDestinationChange = (dealer: string, value: string) => {
    setDealerPreferences((prev) => ({
      ...prev,
      [dealer]: {
        ...prev[dealer],
        destination: value,
      },
    }));
  };

  const handlePreferenceChange = (
    dealer: string,
    preferenceId: string,
    patch: Partial<PreferenceEntry>
  ) => {
    setDealerPreferences((prev) => ({
      ...prev,
      [dealer]: {
        ...prev[dealer],
        preferences: prev[dealer].preferences.map((pref) =>
          pref.id === preferenceId ? { ...pref, ...patch } : pref
        ),
      },
    }));
  };

  const handleAddPreference = (dealer: string) => {
    setDealerPreferences((prev) => {
      const current = prev[dealer];
      if (!current || current.preferences.length >= MAX_PREFERENCES) return prev;
      return {
        ...prev,
        [dealer]: {
          ...current,
          preferences: [...current.preferences, createPreference()],
        },
      };
    });
  };

  const handleRemovePreference = (dealer: string, preferenceId: string) => {
    setDealerPreferences((prev) => {
      const current = prev[dealer];
      if (!current) return prev;
      const nextPreferences = current.preferences.filter((pref) => pref.id !== preferenceId);
      return {
        ...prev,
        [dealer]: {
          ...current,
          preferences: nextPreferences.length ? nextPreferences : [createPreference()],
        },
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Transport Preference</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure each dealer&apos;s destination location and transport company preference list. Up to {MAX_PREFERENCES} preference vendors can be set per dealer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{dealers.length} dealers</Badge>
          <Badge variant="secondary">{transportOptions.length} transport companies</Badge>
        </div>
      </div>

      {!transportOptions.length && (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          Transport companies come from the Admin page. Add companies there to populate the preference list.
        </div>
      )}

      <div className="space-y-6">
        {dealers.map((dealer) => {
          const dealerPreference = dealerPreferences[dealer];
          const preferences = dealerPreference?.preferences || [];

          return (
            <Card key={dealer} className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base text-slate-900">{dealer}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Preference vendors: {preferences.length}/{MAX_PREFERENCES}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddPreference(dealer)}
                    disabled={preferences.length >= MAX_PREFERENCES}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add preference
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-900">Destination location</p>
                    <Input
                      value={dealerPreference?.destination || ""}
                      onChange={(event) => handleDestinationChange(dealer, event.target.value)}
                      placeholder="Enter destination location"
                    />
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-900">Transport company preference list</p>
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="w-16">Preference</TableHead>
                            <TableHead className="w-64">Vendor</TableHead>
                            <TableHead>Truck no.</TableHead>
                            <TableHead>Supplier rating</TableHead>
                            <TableHead>Bank guarantee</TableHead>
                            <TableHead className="w-16 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preferences.map((pref, index) => (
                            <TableRow key={pref.id}>
                              <TableCell className="font-medium text-slate-700">#{index + 1}</TableCell>
                              <TableCell>
                                <select
                                  value={pref.vendorId}
                                  onChange={(event) =>
                                    handlePreferenceChange(dealer, pref.id, {
                                      vendorId: event.target.value,
                                    })
                                  }
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                  <option value="">Select company</option>
                                  {transportOptions.map((company) => (
                                    <option key={company.id} value={company.id}>
                                      {company.name}
                                    </option>
                                  ))}
                                </select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={pref.truckNumber}
                                  onChange={(event) =>
                                    handlePreferenceChange(dealer, pref.id, {
                                      truckNumber: event.target.value,
                                    })
                                  }
                                  placeholder="Truck number"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={pref.supplierRating}
                                  onChange={(event) =>
                                    handlePreferenceChange(dealer, pref.id, {
                                      supplierRating: event.target.value,
                                    })
                                  }
                                  placeholder="Rating"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={pref.bankGuarantee}
                                  onChange={(event) =>
                                    handlePreferenceChange(dealer, pref.id, {
                                      bankGuarantee: event.target.value,
                                    })
                                  }
                                  placeholder="Guarantee details"
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemovePreference(dealer, pref.id)}
                                  aria-label="Remove preference"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {!dealers.length && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No dealers found yet. Dealer names appear once dispatch data is available.
          </div>
        )}
      </div>
    </div>
  );
};

export default TransportPreferencePage;
