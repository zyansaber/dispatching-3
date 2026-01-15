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

const escapePdfText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const buildPdfBlob = (lines: string[]) => {
  const header = "%PDF-1.3\n";
  const objects: string[] = [];

  const contentLines = [
    "BT",
    "/F1 12 Tf",
    "50 760 Td",
    "14 TL",
    ...lines.map((line, index) =>
      `${index === 0 ? "" : "T* "}(${escapePdfText(line)}) Tj`
    ),
    "ET",
  ];
  const contentStream = contentLines.join("\n") + "\n";
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
  );
  objects.push(
    `4 0 obj\n<< /Length ${new TextEncoder().encode(contentStream).length} >>\nstream\n${contentStream}endstream\nendobj\n`
  );
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  const parts = [header, ...objects];
  const offsets: number[] = [];
  let currentOffset = 0;
  const encoder = new TextEncoder();
  parts.forEach((part) => {
    offsets.push(currentOffset);
    currentOffset += encoder.encode(part).length;
  });

  const xrefStart = currentOffset;
  const xrefLines = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  offsets.forEach((offset) => {
    xrefLines.push(`${offset.toString().padStart(10, "0")} 00000 n `);
  });

  const trailer = [
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    `${xrefStart}`,
    "%%EOF\n",
  ];

  const pdfContent = parts.join("") + xrefLines.join("\n") + "\n" + trailer.join("\n");
  return new Blob([pdfContent], { type: "application/pdf" });
};

const TransportDamageRecordPage: React.FC = () => {
  const { transportCompanies } = useDashboardContext();
  const [claims, setClaims] = useState<DamageClaim[]>([]);
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
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

  useEffect(() => {
    if (!modalOpen) {
      setPdfPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    if (!activeClaim) return;
    const companyName = buildCompanyLabel(
      activeClaim,
      transportCompanies[activeClaim.transportCompanyId || ""]?.name
    );
    const pdfLines = [
      "Transport Damage Claim Report",
      `Chassis Number: ${activeClaim.chassisNumber}`,
      `Transport Company: ${companyName}`,
      `PO Number: ${activeClaim.poNumber || "-"}`,
      `Severity: ${activeClaim.severity || "-"}`,
      `Status: ${activeClaim.completed ? "Completed" : "Open"}`,
      `Created At: ${formatDate(activeClaim.createdAt)}`,
      `Updated At: ${formatDate(activeClaim.updatedAt)}`,
      "",
      "Damage Details:",
      activeClaim.damageDetails || "No details provided.",
    ];
    const blob = buildPdfBlob(pdfLines);
    const url = URL.createObjectURL(blob);
    setPdfPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
  }, [activeClaim, modalOpen, transportCompanies]);

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
          await updateDamageClaim(activeClaimId, {
            photoUrls: [...(activeClaim?.photoUrls || []), ...uploads.map((item) => item.url)],
            photoPaths: [...(activeClaim?.photoPaths || []), ...uploads.map((item) => item.path)],
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
          severity: formData.severity,
        });

        if (files.length) {
          const uploads = await uploadDamageClaimPhotos(claimId, files);
          await updateDamageClaim(claimId, {
            photoUrls: uploads.map((item) => item.url),
            photoPaths: uploads.map((item) => item.path),
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

  const handleDownloadPdf = (claim: DamageClaim) => {
    const companyName = buildCompanyLabel(
      claim,
      transportCompanies[claim.transportCompanyId || ""]?.name
    );
    const pdfLines = [
      "Transport Damage Claim Report",
      `Chassis Number: ${claim.chassisNumber}`,
      `Transport Company: ${companyName}`,
      `PO Number: ${claim.poNumber || "-"}`,
      `Severity: ${claim.severity || "-"}`,
      `Status: ${claim.completed ? "Completed" : "Open"}`,
      `Created At: ${formatDate(claim.createdAt)}`,
      `Updated At: ${formatDate(claim.updatedAt)}`,
      "",
      "Damage Details:",
      claim.damageDetails || "No details provided.",
    ];
    const blob = buildPdfBlob(pdfLines);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `damage-claim-${claim.chassisNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
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
                        <Button size="sm" variant="outline" onClick={() => handleDownloadPdf(claim)}>
                          Report
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
                      Add photos (multiple)
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
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Preview Photos</h4>
                  <div className="mt-2 h-40 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3">
                    {activeClaim?.photoUrls?.length ? (
                      <div className="grid grid-cols-2 gap-3">
                        {activeClaim.photoUrls.map((url, index) => (
                          <div key={url} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <img
                              src={url}
                              alt={`Damage photo ${index + 1}`}
                              className="h-24 w-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">No photos uploaded yet.</div>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500">PDF Preview</h4>
                  {pdfPreviewUrl ? (
                    <iframe
                      title="Damage claim PDF preview"
                      src={pdfPreviewUrl}
                      className="mt-2 h-48 w-full rounded-lg border border-slate-200"
                    />
                  ) : (
                    <div className="mt-2 text-sm text-slate-500">Open a saved claim to preview PDF.</div>
                  )}
                  {activeClaim && (
                    <Button
                      type="button"
                      className="mt-3"
                      variant="outline"
                      onClick={() => handleDownloadPdf(activeClaim)}
                    >
                      Download PDF
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
