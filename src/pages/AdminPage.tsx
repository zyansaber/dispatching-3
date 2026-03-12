import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDashboardContext } from "./Index";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

const normalize = (value: string) => value.trim().toLowerCase();

const AdminPage: React.FC = () => {
  const {
    transportCompanies,
    transportPreferences,
    schedule,
    dealerEmails,
    handleSaveTransportCompany,
    handleDeleteTransportCompany,
    handleSaveDealerEmail,
    handleDeleteDealerEmail,
  } = useDashboardContext();

  const [newCompany, setNewCompany] = useState("");
  const [newDealer, setNewDealer] = useState("");
  const [newDealerEmail, setNewDealerEmail] = useState("");
  const [companyEmailDrafts, setCompanyEmailDrafts] = useState<Record<string, string>>({});
  const [dealerEmailDrafts, setDealerEmailDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"companies" | "dealers">("companies");

  const companies = useMemo(() => {
    const base = Object.entries(transportCompanies || {}).map(([id, payload]) => ({
      id,
      name: payload.name,
      email: payload.email || "",
      isExisting: true,
    }));

    const existingNameSet = new Set(base.map((item) => normalize(item.name || "")));
    const fromPreferences: Array<{ id: string; name: string; email: string; isExisting: boolean }> = [];

    Object.values(transportPreferences || {}).forEach((entry) => {
      (entry.preferences || []).forEach((pref) => {
        const vendorName = pref.vendorName?.trim();
        if (!vendorName) return;
        const key = normalize(vendorName);
        if (existingNameSet.has(key)) return;
        existingNameSet.add(key);
        fromPreferences.push({
          id: `pref:${key}`,
          name: vendorName,
          email: "",
          isExisting: false,
        });
      });
    });

    return [...base, ...fromPreferences].sort((a, b) => a.name.localeCompare(b.name));
  }, [transportCompanies, transportPreferences]);

  const dealerList = useMemo(() => {
    const dealers = new Set<string>();

    (schedule || []).forEach((entry) => {
      const candidateKeys = ["Dealer", "dealer", "Scheduled Dealer", "scheduledDealer"] as const;
      candidateKeys.forEach((key) => {
        const value = entry[key as keyof typeof entry];
        if (typeof value === "string" && value.trim()) {
          dealers.add(value.trim());
        }
      });
    });

    return Array.from(dealers).sort((a, b) => a.localeCompare(b));
  }, [schedule]);

  const handleAddCompany = async () => {
    const name = newCompany.trim();
    if (!name) return;
    setSaving(true);
    try {
      await handleSaveTransportCompany(null, { name, email: "" });
      toast.success(`Added ${name}`);
      setNewCompany("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add company";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admin Directory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              placeholder="Add a transport company"
              className="w-64"
            />
            <Button onClick={handleAddCompany} disabled={!newCompany.trim() || saving}>
              {saving ? "Saving..." : "Add company"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage transport company and dealer email addresses for PGI missing-delivery notifications.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex gap-2">
          <Button variant={activeTab === "companies" ? "default" : "outline"} onClick={() => setActiveTab("companies")}>Transport Companies</Button>
          <Button variant={activeTab === "dealers" ? "default" : "outline"} onClick={() => setActiveTab("dealers")}>Dealers</Button>
        </div>

        {activeTab === "companies" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {companies.map((company) => (
              <Card key={company.id} className="flex flex-col gap-3">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{company.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {company.isExisting ? "Configured in transport companies" : "From transport preferences"}
                      </p>
                    </div>
                    {company.isExisting && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDeleteTransportCompany(company.id)}
                        aria-label={`Delete ${company.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company Email</div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={companyEmailDrafts[company.id] ?? company.email ?? ""}
                        onChange={(e) =>
                          setCompanyEmailDrafts((prev) => ({ ...prev, [company.id]: e.target.value }))
                        }
                        placeholder="company@email.com"
                      />
                      <Button
                        onClick={async () => {
                          const email = (companyEmailDrafts[company.id] ?? company.email ?? "").trim();
                          try {
                            await handleSaveTransportCompany(
                              company.isExisting ? company.id : null,
                              {
                                ...(company.isExisting ? transportCompanies[company.id] : {}),
                                name: company.name,
                                email,
                              }
                            );
                            toast.success(`Saved email for ${company.name}`);
                          } catch (error) {
                            const message = error instanceof Error ? error.message : "Failed to save company email";
                            toast.error(message);
                          }
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "dealers" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Input
                value={newDealer}
                onChange={(event) => setNewDealer(event.target.value)}
                placeholder="Add dealer"
                className="w-64"
              />
              <Input
                value={newDealerEmail}
                onChange={(event) => setNewDealerEmail(event.target.value)}
                placeholder="Optional email"
                className="w-72"
              />
              <Button
                onClick={async () => {
                  const dealer = newDealer.trim();
                  const email = newDealerEmail.trim();
                  if (!dealer) {
                    toast.error("Please enter dealer name.");
                    return;
                  }
                  if (email) {
                    await handleSaveDealerEmail(dealer, email);
                  }
                  if (email) {
                    setDealerEmailDrafts((prev) => ({ ...prev, [dealer]: email }));
                  }
                  setNewDealer("");
                  setNewDealerEmail("");
                  toast.success(`Saved dealer ${dealer}`);
                }}
              >
                Add dealer
              </Button>
            </div>

            <div className="rounded-lg border border-border">
              <div className="grid grid-cols-[minmax(160px,1fr)_minmax(260px,1fr)_120px_90px] gap-2 border-b bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500">
                <div>Dealer</div>
                <div>Email</div>
                <div>Actions</div>
                <div>Remove</div>
              </div>
              {dealerList.map((dealer) => (
                <div key={dealer} className="grid grid-cols-[minmax(160px,1fr)_minmax(260px,1fr)_120px_90px] items-center gap-2 border-b px-4 py-3">
                  <div className="text-sm font-medium">{dealer}</div>
                  <Input
                    value={dealerEmailDrafts[dealer] ?? dealerEmails[dealer] ?? ""}
                    onChange={(e) =>
                      setDealerEmailDrafts((prev) => ({ ...prev, [dealer]: e.target.value }))
                    }
                    placeholder="dealer@email.com"
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      const email = (dealerEmailDrafts[dealer] ?? dealerEmails[dealer] ?? "").trim();
                      if (!email) {
                        toast.error("Please enter email before saving");
                        return;
                      }
                      await handleSaveDealerEmail(dealer, email);
                      toast.success(`Saved email for ${dealer}`);
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      await handleDeleteDealerEmail(dealer);
                      setDealerEmailDrafts((prev) => ({ ...prev, [dealer]: "" }));
                      toast.success(`Removed email for ${dealer}`);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              ))}
              {!dealerList.length && (
                <div className="p-6 text-center text-sm text-muted-foreground">No dealers found.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
