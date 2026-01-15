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

const getClaimAttachments = (claim: DamageClaim) => {
  if (claim.attachments && claim.attachments.length) return claim.attachments;
  const photoUrls = claim.photoUrls || [];
  return photoUrls.map((url, index) => ({
    url,
    path: claim.photoPaths?.[index] || url,
    name: `Photo ${index + 1}`,
    type: "image/jpeg",
  }));
};

const buildPrintHtml = (claim: DamageClaim, companyName: string) => {
  const attachments = getClaimAttachments(claim);
  const images = attachments.filter((item) => item.type.startsWith("image/"));
  const pdfs = attachments.filter((item) => item.type === "application/pdf");
  const imageMarkup = images.length
    ? images
        .map(
          (file) =>
            `<div class="photo-card"><img src="${file.url}" alt="${file.name}" /><div class="caption">${file.name}</div></div>`
        )
        .join("")
    : `<div class="muted">No photos uploaded.</div>`;
  const pdfMarkup = pdfs.length
    ? pdfs
        .map(
          (file) =>
            `<div class="pdf-card"><div class="pdf-title">${file.name}</div><a href="${file.url}" target="_blank" rel="noreferrer">Open PDF</a></div>`
        )
        .join("")
    : `<div class="muted">No PDF evidence uploaded.</div>`;

  return `
    <html>
      <head>
        <title>Transport Damage Claim</title>
        <style>
          body { font-family: "Inter", Arial, sans-serif; padding: 32px; color: #0f172a; }
          h1 { font-size: 24px; margin-bottom: 8px; }
          .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
          .meta div { background: #f8fafc; border-radius: 10px; padding: 10px 12px; font-size: 13px; }
          .section { margin-top: 28px; }
          .section h2 { font-size: 15px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; }
          .details { background: #f8fafc; border-radius: 12px; padding: 14px; white-space: pre-wrap; font-size: 13px; }
          .photos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
          .photo-card { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; }
          .photo-card img { width: 100%; height: 200px; object-fit: cover; display: block; }
          .caption { padding: 8px 10px; font-size: 11px; color: #475569; }
          .pdfs { display: grid; gap: 8px; }
          .pdf-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: #fff; font-size: 13px; }
          .pdf-title { font-weight: 600; margin-bottom: 4px; }
          .muted { color: #94a3b8; font-size: 13px; }
          @media print { .photo-card img { height: 220px; } }
        </style>
      </head>
      <body>
        <h1>Transport Damage Claim Report</h1>
        <div class="meta">
          <div><strong>Chassis:</strong> ${claim.chassisNumber}</div>
          <div><strong>Company:</strong> ${companyName}</div>
          <div><strong>PO Number:</strong> ${claim.poNumber || "-"}</div>
          <div><strong>Severity:</strong> ${claim.severity || "-"}</div>
          <div><strong>Status:</strong> ${claim.completed ? "Completed" : "Open"}</div>
          <div><strong>Updated:</strong> ${formatDate(claim.updatedAt)}</div>
        </div>

        <div class="section">
          <h2>Damage Details</h2>
          <div class="details">${claim.damageDetails || "No details provided."}</div>
        </div>

        <div class="section">
          <h2>Photo Evidence</h2>
          <div class="photos">${imageMarkup}</div>
        </div>

        <div class="section">
          <h2>PDF Evidence</h2>
          <div class="pdfs">${pdfMarkup}</div>
        </div>
        <script>
          window.onload = () => {
            window.print();
          };
        </script>
      </body>
    </html>
  `;
};

const TransportDamageRecordPage: React.FC = () => {
  const { transportCompanies } = useDashboardContext();
  const [claims, setClaims] = useState<DamageClaim[]>([]);
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    chassisNumber: "",
    transportCompanyId: "",
    poNumber: "",
    damageDetails: "",
    severity: "medium",
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

  const activeClaim = useMemo(
    () => claims.find((claim) => claim.id === activeClaimId) || null,
    [claims, activeClaimId]
  );

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files ? Array.from(event.target.files) : [];
    if (!selected.length) return;
    setFiles((prev) => [...prev, ...selected]);
    event.target.value = "";
  };

  const openAddModal = () => {
    setActiveClaimId(null);
    setFormData({
      chassisNumber: "",
      transportCompanyId: "",
      poNumber: "",
      damageDetails: "",
      severity: "medium",
    });
    setFiles([]);
    setModalOpen(true);
  };

  const openEditModal = (claim: DamageClaim) => {
    setActiveClaimId(claim.id || null);
    setFormData({
      chassisNumber: claim.chassisNumber || "",
      transportCompanyId: claim.transportCompanyId || "",
      poNumber: claim.poNumber || "",
      damageDetails: claim.damageDetails || "",
      severity: claim.severity || "medium",
    });
    setFiles([]);
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.chassisNumber.trim()) return;
    setIsSubmitting(true);
    try {
      const company = companyOptions.find(
        (option) => option.id === formData.transportCompanyId
      );

      if (activeClaimId) {
        await updateDamageClaim(activeClaimId, {
          chassisNumber: formData.chassisNumber.trim(),
          transportCompanyId: formData.transportCompanyId || null,
          transportCompanyName: company?.name || null,
          poNumber: formData.poNumber.trim() || null,
          damageDetails: formData.damageDetails.trim() || null,
          severity: formData.severity,
        });

        if (files.length) {
          const uploads = await uploadDamageClaimPhotos(activeClaimId, files);
          const imageUploads = uploads.filter((item) => item.type.startsWith("image/"));
          await updateDamageClaim(activeClaimId, {
            attachments: [...(activeClaim?.attachments || []), ...uploads],
            photoUrls: [
              ...(activeClaim?.photoUrls || []),
              ...imageUploads.map((item) => item.url),
            ],
            photoPaths: [
              ...(activeClaim?.photoPaths || []),
              ...imageUploads.map((item) => item.path),
            ],
          });
        }
      } else {
        const claimId = await createDamageClaim({
          chassisNumber: formData.chassisNumber.trim(),
          transportCompanyId: formData.transportCompanyId || null,
          transportCompanyName: company?.name || null,
          poNumber: formData.poNumber.trim() || null,
          damageDetails: formData.damageDetails.trim() || null,
          completed: false,
          photoUrls: [],
          photoPaths: [],
          attachments: [],
          severity: formData.severity,
        });

        if (files.length) {
          const uploads = await uploadDamageClaimPhotos(claimId, files);
          const imageUploads = uploads.filter((item) => item.type.startsWith("image/"));
          await updateDamageClaim(claimId, {
            attachments: uploads,
            photoUrls: imageUploads.map((item) => item.url),
            photoPaths: imageUploads.map((item) => item.path),
          });
        }
      }

      setModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleComplete = async (claim: DamageClaim) => {
    if (!claim.id) return;
    await updateDamageClaim(claim.id, {
      completed: !claim.completed,
    });
  };

  const handlePrintReport = (claim: DamageClaim) => {
    const companyName = buildCompanyLabel(
      claim,
      transportCompanies[claim.transportCompanyId || ""]?.name
    );
    const html = buildPrintHtml(claim, companyName);
    const printWindow = window.open("", "_blank", "width=980,height=720");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Transport Damage Record</h2>
            <p className="text-sm text-slate-500">Track transport damage claims and upload evidence.</p>
          </div>
          <Button onClick={openAddModal}>Add Claim</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
      </div>

      <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chassis</TableHead>
              <TableHead>Transport Company</TableHead>
              <TableHead>PO Number</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClaims.length ? (
              filteredClaims.map((claim) => {
                const companyName =
                  transportCompanies[claim.transportCompanyId || ""]?.name;
                return (
                  <TableRow key={claim.id}>
                    <TableCell className="font-semibold">{claim.chassisNumber}</TableCell>
                    <TableCell>{buildCompanyLabel(claim, companyName)}</TableCell>
                    <TableCell>{claim.poNumber || "-"}</TableCell>
                    <TableCell className="capitalize">{claim.severity || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={claim.completed ? "secondary" : "default"}>
                        {claim.completed ? "Completed" : "Open"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditModal(claim)}>
                          Details
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handlePrintReport(claim)}>
                          Print Report
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                  No claims found for the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {activeClaim ? "Claim Details" : "New Damage Claim"}
                </h3>
                <p className="text-xs text-slate-500">
                  {activeClaim ? "Update details, photos, and status." : "Fill in claim details and upload files."}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Close
              </Button>
            </div>
            <div className="grid gap-6 p-5 lg:grid-cols-[1.2fr_1fr]">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
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
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                    value={formData.severity}
                    onChange={(event) => handleChange("severity", event.target.value)}
                  >
                    <option value="low">Low severity</option>
                    <option value="medium">Medium severity</option>
                    <option value="high">High severity</option>
                    <option value="critical">Critical severity</option>
                  </select>
                </div>
                <Textarea
                  placeholder="Describe the damage details"
                  className="min-h-[120px]"
                  value={formData.damageDetails}
                  onChange={(event) => handleChange("damageDetails", event.target.value)}
                />
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-sm font-medium text-slate-700">
                      Add files (photos or PDFs)
                    </label>
                    <label className="cursor-pointer rounded-md border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500">
                      More files
                      <input type="file" multiple className="hidden" onChange={handleFileSelect} />
                    </label>
                  </div>
                  {files.length ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-500">
                      {files.map((file, index) => (
                        <li key={`${file.name}-${index}`}>{file.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">No new files selected.</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {activeClaim && (
                    <Button
                      type="button"
                      variant={activeClaim.completed ? "secondary" : "default"}
                      onClick={() => handleToggleComplete(activeClaim)}
                    >
                      {activeClaim.completed ? "Reopen Claim" : "Mark Finished"}
                    </Button>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Saving..." : activeClaim ? "Save Changes" : "Create Claim"}
                    </Button>
                  </div>
                </div>
              </form>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Uploaded Files</h4>
                  <div className="mt-2 h-48 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3">
                    {activeClaim ? (
                      (() => {
                        const attachments = getClaimAttachments(activeClaim);
                        const images = attachments.filter((item) => item.type.startsWith("image/"));
                        const pdfs = attachments.filter((item) => item.type === "application/pdf");
                        if (!attachments.length) {
                          return <div className="text-sm text-slate-500">No files uploaded yet.</div>;
                        }
                        return (
                          <div className="space-y-3">
                            {images.length ? (
                              <div className="grid grid-cols-2 gap-3">
                                {images.map((file, index) => (
                                  <div key={file.url} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                    <img
                                      src={file.url}
                                      alt={`Damage photo ${index + 1}`}
                                      className="h-24 w-full object-cover"
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {pdfs.length ? (
                              <div className="space-y-2">
                                <div className="text-xs font-semibold uppercase text-slate-500">PDF Evidence</div>
                                {pdfs.map((file) => (
                                  <div key={file.url} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                    <iframe title={file.name} src={file.url} className="h-28 w-full" />
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-sm text-slate-500">No files uploaded yet.</div>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Print Preview</h4>
                  <div className="mt-2 text-sm text-slate-500">
                    Use the button below to open a printable report in a new window.
                  </div>
                  {activeClaim && (
                    <Button
                      type="button"
                      className="mt-3"
                      variant="outline"
                      onClick={() => handlePrintReport(activeClaim)}
                    >
                      Open Print View
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransportDamageRecordPage;
