import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDashboardContext } from "./Index";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

const AdminPage: React.FC = () => {
  const {
    transportCompanies,
    dealerEmails,
    handleSaveTransportCompany,
    handleDeleteTransportCompany,
    handleSaveDealerEmail,
    handleDeleteDealerEmail,
  } = useDashboardContext();

  const [newCompany, setNewCompany] = useState("");
  const [draftDealers, setDraftDealers] = useState<Record<string, string>>({});
  const [companyEmailDrafts, setCompanyEmailDrafts] = useState<Record<string, string>>({});
  const [dealerEmailDrafts, setDealerEmailDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"companies" | "dealers">("companies");

  const companies = useMemo(
    () =>
      Object.entries(transportCompanies || {}).map(([id, payload]) => ({
        id,
        ...payload,
      })),
    [transportCompanies]
  );

  const dealerList = useMemo(() => {
    const dealers = new Set<string>();
    companies.forEach((company) => (company.dealers || []).forEach((dealer) => dealers.add(dealer)));
    return Array.from(dealers).sort((a, b) => a.localeCompare(b));
  }, [companies]);

  const handleAddCompany = async () => {
    const name = newCompany.trim();
    if (!name) return;
    setSaving(true);
    try {
      await handleSaveTransportCompany(null, { name, dealers: [], email: "" });
      toast.success(`Added ${name}`);
      setNewCompany("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add company";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddDealer = async (companyId: string) => {
    const dealer = draftDealers[companyId]?.trim();
    if (!dealer) return;
    const existing = transportCompanies[companyId]?.dealers || [];
    const nextDealers = Array.from(new Set([...existing, dealer]));
    await handleSaveTransportCompany(companyId, {
      ...transportCompanies[companyId],
      dealers: nextDealers,
    });
    setDraftDealers((d) => ({ ...d, [companyId]: "" }));
  };

  const handleRemoveDealer = async (companyId: string, dealer: string) => {
    const existing = transportCompanies[companyId]?.dealers || [];
    const nextDealers = existing.filter((d) => d !== dealer);
    await handleSaveTransportCompany(companyId, {
      ...transportCompanies[companyId],
      dealers: nextDealers,
    });
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
            Manage transport company and dealer email addresses for automated PGI missing-delivery notifications.
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
                      <p className="text-xs text-muted-foreground">Dealers: {company.dealers?.length || 0}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteTransportCompany(company.id)} aria-label={`Delete ${company.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company Email</div>
                    <div className="flex items-center gap-2">
                      <Input value={companyEmailDrafts[company.id] ?? company.email ?? ""} onChange={(e) => setCompanyEmailDrafts((prev) => ({ ...prev, [company.id]: e.target.value }))} placeholder="company@email.com" />
                      <Button onClick={() => handleSaveTransportCompany(company.id, { ...transportCompanies[company.id], email: (companyEmailDrafts[company.id] ?? company.email ?? "").trim() })}>Save</Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(company.dealers || []).map((dealer) => (
                      <Badge key={dealer} variant="secondary" className="gap-2">{dealer}<button type="button" className="rounded-full bg-destructive px-2 py-0.5 text-[10px] text-destructive-foreground" onClick={() => handleRemoveDealer(company.id, dealer)}>remove</button></Badge>
                    ))}
                    {!(company.dealers || []).length && <span className="text-xs text-muted-foreground">No dealers yet</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input value={draftDealers[company.id] || ""} onChange={(e) => setDraftDealers((d) => ({ ...d, [company.id]: e.target.value }))} placeholder="Add dealer" />
                    <Button onClick={() => handleAddDealer(company.id)} disabled={!draftDealers[company.id]?.trim()}>Add</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "dealers" && (
          <div className="rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(160px,1fr)_minmax(260px,1fr)_120px_90px] gap-2 border-b bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500"><div>Dealer</div><div>Email</div><div>Actions</div><div>Remove</div></div>
            {dealerList.map((dealer) => (
              <div key={dealer} className="grid grid-cols-[minmax(160px,1fr)_minmax(260px,1fr)_120px_90px] items-center gap-2 border-b px-4 py-3">
                <div className="text-sm font-medium">{dealer}</div>
                <Input value={dealerEmailDrafts[dealer] ?? dealerEmails[dealer] ?? ""} onChange={(e) => setDealerEmailDrafts((prev) => ({ ...prev, [dealer]: e.target.value }))} placeholder="dealer@email.com" />
                <Button size="sm" onClick={async () => { const email = (dealerEmailDrafts[dealer] ?? dealerEmails[dealer] ?? "").trim(); if (!email) { toast.error("Please enter email before saving"); return; } await handleSaveDealerEmail(dealer, email); toast.success(`Saved email for ${dealer}`); }}>Save</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { await handleDeleteDealerEmail(dealer); setDealerEmailDrafts((prev) => ({ ...prev, [dealer]: "" })); toast.success(`Removed email for ${dealer}`); }}>Delete</Button>
              </div>
            ))}
            {!dealerList.length && <div className="p-6 text-center text-sm text-muted-foreground">No dealers found. Add dealers under transport companies first.</div>}
          </div>
        )}
      </div>

    </div>
  );
};

export default AdminPage;
