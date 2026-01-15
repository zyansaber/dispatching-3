import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDashboardContext } from "@/pages/Index";
import {
  createDamageClaim,
  subscribeDamageClaims,
  updateDamageClaim,
  uploadDamageClaimPhotos,
} from "@/lib/firebase";
import type { DamageClaim } from "@/types";

const buildCompanyLabel = (claim: DamageClaim, companyName?: string) =>
  companyName || claim.transportCompanyName || "-";

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const TransportDamageRecordPage: React.FC = () => {
  const { transportCompanies } = useDashboardContext();
  const [claims, setClaims] = useState<DamageClaim[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    chassisNumber: "",
    transportCompanyId: "",
    poNumber: "",
    damageDetails: "",
  });
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeDamageClaims((data) => {
      const entries = Object.entries(data || {}).map(([id, claim]) => ({
        id,
        ...claim,
      }));
      entries.sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      setClaims(entries);
      setSelectedClaimId((current) =>
        current ? current : entries[0]?.id || null
      );
    });
    return () => unsubscribe();
  }, []);

  const companyOptions = useMemo(
    () =>
      Object.entries(transportCompanies || {}).map(([id, company]) => ({
        id,
        name: company.name,
      })),
    [transportCompanies]
  );

  const filteredClaims = useMemo(() => {
    return claims.filter((claim) => {
      const matchesCompany =
        filterCompany === "all"
          ? true
          : claim.transportCompanyId === filterCompany;
      const matchesStatus =
        filterStatus === "all"
          ? true
          : filterStatus === "completed"
          ? claim.completed
          : !claim.completed;
      return matchesCompany && matchesStatus;
    });
  }, [claims, filterCompany, filterStatus]);

  const selectedClaim = useMemo(
    () => claims.find((claim) => claim.id === selectedClaimId) || null,
    [claims, selectedClaimId]
  );

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.chassisNumber.trim()) return;
    setIsSubmitting(true);
    try {
      const company = companyOptions.find(
        (option) => option.id === formData.transportCompanyId
      );
      const claimId = await createDamageClaim({
        chassisNumber: formData.chassisNumber.trim(),
        transportCompanyId: formData.transportCompanyId || null,
        transportCompanyName: company?.name || null,
        poNumber: formData.poNumber.trim() || null,
        damageDetails: formData.damageDetails.trim() || null,
        completed: false,
        photoUrls: [],
        photoPaths: [],
      });

      if (files.length) {
        const uploads = await uploadDamageClaimPhotos(claimId, files);
        await updateDamageClaim(claimId, {
          photoUrls: uploads.map((item) => item.url),
          photoPaths: uploads.map((item) => item.path),
        });
      }

      setFormData({
        chassisNumber: "",
        transportCompanyId: "",
        poNumber: "",
        damageDetails: "",
      });
      setFiles([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleComplete = async (claim: DamageClaim, checked: boolean) => {
    if (!claim.id) return;
    await updateDamageClaim(claim.id, {
      completed: checked,
    });
  };

  const handlePdfExport = async (claim: DamageClaim) => {
    if (!claim) return;
    const companyName = buildCompanyLabel(
      claim,
      transportCompanies[claim.transportCompanyId || ""]?.name
    );
    const photoMarkup =
      claim.photoUrls && claim.photoUrls.length
        ? claim.photoUrls
            .map(
              (url) =>
                `<div class="photo"><img src="${url}" alt="Damage photo" /></div>`
            )
            .join("")
        : `<p class="muted">No photos uploaded.</p>`;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Transport Damage Claim</title>
          <style>
            body { font-family: "Inter", Arial, sans-serif; padding: 32px; color: #0f172a; }
            h1 { margin-bottom: 12px; font-size: 24px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px; margin-bottom: 16px; }
            .meta div { padding: 8px 12px; background: #f8fafc; border-radius: 8px; }
            .section { margin-top: 24px; }
            .section h2 { font-size: 16px; margin-bottom: 8px; }
            .details { padding: 12px; background: #f8fafc; border-radius: 8px; white-space: pre-wrap; }
            .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
            .photo { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px; }
            .photo img { width: 100%; height: 180px; object-fit: cover; border-radius: 6px; }
            .muted { color: #64748b; font-size: 13px; }
            @media print { .photo img { height: 200px; } }
          </style>
        </head>
        <body>
          <h1>Transport Damage Claim Report</h1>
          <div class="meta">
            <div><strong>Chassis:</strong> ${claim.chassisNumber}</div>
            <div><strong>Company:</strong> ${companyName}</div>
            <div><strong>PO Number:</strong> ${claim.poNumber || "-"}</div>
            <div><strong>Status:</strong> ${claim.completed ? "Completed" : "Open"}</div>
            <div><strong>Created:</strong> ${formatDate(claim.createdAt)}</div>
            <div><strong>Updated:</strong> ${formatDate(claim.updatedAt)}</div>
          </div>
          <div class="section">
            <h2>Damage Details</h2>
            <div class="details">${claim.damageDetails || "No details provided."}</div>
          </div>
          <div class="section">
            <h2>Photos</h2>
            <div class="photos">${photoMarkup}</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Transport Damage Record</h2>
            <p className="text-sm text-slate-500">Create a new damage claim and upload photos.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <Input
            placeholder="Chassis number"
            value={formData.chassisNumber}
            onChange={(event) => handleChange("chassisNumber", event.target.value)}
            required
          />
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            value={formData.transportCompanyId}
            onChange={(event) => handleChange("transportCompanyId", event.target.value)}
          >
            <option value="">Select transport company</option>
            {companyOptions.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <Input
            placeholder="PO number"
            value={formData.poNumber}
            onChange={(event) => handleChange("poNumber", event.target.value)}
          />
          <Input
            type="file"
            multiple
            onChange={(event) =>
              setFiles(event.target.files ? Array.from(event.target.files) : [])
            }
          />
          <div className="md:col-span-2">
            <Textarea
              placeholder="Describe the damage details"
              className="min-h-[120px]"
              value={formData.damageDetails}
              onChange={(event) => handleChange("damageDetails", event.target.value)}
            />
          </div>
          <div className="md:col-span-2 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Photos will be uploaded to gs://scheduling-dd672.firebasestorage.app.
            </p>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Add Damage Claim"}
            </Button>
          </div>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Company</label>
              <select
                className="mt-1 h-9 w-full min-w-[180px] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                value={filterCompany}
                onChange={(event) => setFilterCompany(event.target.value)}
              >
                <option value="all">All companies</option>
                {companyOptions.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Status</label>
              <select
                className="mt-1 h-9 w-full min-w-[150px] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value)}
              >
                <option value="all">All claims</option>
                <option value="open">Open</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Done</TableHead>
                <TableHead>Chassis</TableHead>
                <TableHead>Transport Company</TableHead>
                <TableHead>PO Number</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClaims.length ? (
                filteredClaims.map((claim) => {
                  const companyName =
                    transportCompanies[claim.transportCompanyId || ""]?.name;
                  return (
                    <TableRow
                      key={claim.id}
                      className={`cursor-pointer ${
                        claim.id === selectedClaimId ? "bg-slate-50" : ""
                      }`}
                      onClick={() => setSelectedClaimId(claim.id || null)}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-slate-900"
                          checked={Boolean(claim.completed)}
                          onChange={(event) =>
                            handleToggleComplete(claim, event.target.checked)
                          }
                        />
                      </TableCell>
                      <TableCell className="font-semibold">
                        {claim.chassisNumber}
                      </TableCell>
                      <TableCell>{buildCompanyLabel(claim, companyName)}</TableCell>
                      <TableCell>{claim.poNumber || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={claim.completed ? "secondary" : "default"}>
                          {claim.completed ? "Completed" : "Open"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                    No claims found for the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Claim Preview</h3>
              <p className="text-xs text-slate-500">Select a claim to view details.</p>
            </div>
            {selectedClaim && (
              <Button size="sm" variant="outline" onClick={() => handlePdfExport(selectedClaim)}>
                Generate PDF
              </Button>
            )}
          </div>
          {selectedClaim ? (
            <div className="space-y-4">
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Chassis</span>
                  <span>{selectedClaim.chassisNumber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Company</span>
                  <span>
                    {buildCompanyLabel(
                      selectedClaim,
                      transportCompanies[selectedClaim.transportCompanyId || ""]?.name
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">PO Number</span>
                  <span>{selectedClaim.poNumber || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Status</span>
                  <Badge variant={selectedClaim.completed ? "secondary" : "default"}>
                    {selectedClaim.completed ? "Completed" : "Open"}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500">
                  Updated: {formatDate(selectedClaim.updatedAt || selectedClaim.createdAt)}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-500">Damage Details</h4>
                <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
                  {selectedClaim.damageDetails || "No details provided."}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-500">Photos</h4>
                <div className="mt-2 h-[240px] overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3">
                  {selectedClaim.photoUrls && selectedClaim.photoUrls.length ? (
                    <div className="grid grid-cols-2 gap-3">
                      {selectedClaim.photoUrls.map((url, index) => (
                        <div key={url} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                          <img
                            src={url}
                            alt={`Damage photo ${index + 1}`}
                            className="h-32 w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">No photos uploaded.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">No claim selected.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransportDamageRecordPage;
