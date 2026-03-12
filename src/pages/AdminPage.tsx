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
    handleSaveTransportCompany,
    handleDeleteTransportCompany,
  } = useDashboardContext();

  const [newCompany, setNewCompany] = useState("");
  const [draftDealers, setDraftDealers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const companies = useMemo(
    () =>
      Object.entries(transportCompanies || {}).map(([id, payload]) => ({
        id,
        ...payload,
      })),
    [transportCompanies]
  );

  const handleAddCompany = async () => {
    const name = newCompany.trim();
    if (!name) return;
    setSaving(true);
    try {
      await handleSaveTransportCompany(null, { name, dealers: [] });
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
          <CardTitle className="text-lg">Transport Companies</CardTitle>
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
            Manage transport companies and optional dealer lists for use across the dispatch dashboard.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {companies.map((company) => (
          <Card key={company.id} className="flex flex-col gap-3">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{company.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">Dealers: {company.dealers?.length || 0}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={() => handleDeleteTransportCompany(company.id)}
                  aria-label={`Delete ${company.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {(company.dealers || []).map((dealer) => (
                  <Badge key={dealer} variant="secondary" className="gap-2">
                    {dealer}
                    <button
                      type="button"
                      className="rounded-full bg-destructive px-2 py-0.5 text-[10px] text-destructive-foreground"
                      onClick={() => handleRemoveDealer(company.id, dealer)}
                    >
                      remove
                    </button>
                  </Badge>
                ))}
                {!(company.dealers || []).length && (
                  <span className="text-xs text-muted-foreground">No dealers yet</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  value={draftDealers[company.id] || ""}
                  onChange={(e) =>
                    setDraftDealers((d) => ({ ...d, [company.id]: e.target.value }))
                  }
                  placeholder="Add dealer"
                />
                <Button onClick={() => handleAddDealer(company.id)} disabled={!draftDealers[company.id]?.trim()}>
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {!companies.length && (
          <div className="col-span-full rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No transport companies yet. Add one to get started.
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
