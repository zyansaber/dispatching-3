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

const escapePdfText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const loadImageData = async (url: string) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
  img.src = url;
  const image = await loaded;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas not supported");
  context.drawImage(image, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const base64 = dataUrl.split(",")[1] || "";
  return {
    data: base64ToBytes(base64),
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
};

const loadClaimImages = async (urls: string[]) => {
  const results = await Promise.allSettled(urls.map((url) => loadImageData(url)));
  const images = results
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof loadImageData>>> => result.status === "fulfilled")
    .map((result) => result.value);
  const failedCount = results.filter((result) => result.status === "rejected").length;
  return { images, failedCount };
};

const buildPdfBlob = async (lines: string[], images: Array<{ data: Uint8Array; width: number; height: number }>) => {
  const encoder = new TextEncoder();
  const objects: Array<{ id: number; data: Uint8Array }> = [];
  const parts: Uint8Array[] = [];
  const header = encoder.encode("%PDF-1.3\n");
  parts.push(header);

  const imageObjectIds: number[] = [];
  let nextObjectId = 6;
  images.forEach((image) => {
    imageObjectIds.push(nextObjectId);
    const imageHeader = `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n`;
    const imageFooter = "\nendstream\n";
    const imageContent = new Uint8Array(
      encoder.encode(imageHeader).length + image.data.length + encoder.encode(imageFooter).length
    );
    imageContent.set(encoder.encode(imageHeader), 0);
    imageContent.set(image.data, encoder.encode(imageHeader).length);
    imageContent.set(
      encoder.encode(imageFooter),
      encoder.encode(imageHeader).length + image.data.length
    );
    const objectData = encoder.encode(`${nextObjectId} 0 obj\n`);
    const endData = encoder.encode("endobj\n");
    const combined = new Uint8Array(
      objectData.length + imageContent.length + endData.length
    );
    combined.set(objectData, 0);
    combined.set(imageContent, objectData.length);
    combined.set(endData, objectData.length + imageContent.length);
    objects.push({ id: nextObjectId, data: combined });
    nextObjectId += 1;
  });

  const contentLines = [
    "BT",
    "/F1 12 Tf",
    "50 770 Td",
    "14 TL",
    ...lines.map((line, index) =>
      `${index === 0 ? "" : "T* "}(${escapePdfText(line)}) Tj`
    ),
    "ET",
  ];

  let imageYOffset = 520;
  if (images.length) {
    contentLines.push("BT", "/F1 13 Tf", "50 560 Td", "(Photo evidence) Tj", "ET");
  }

  images.forEach((image, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const maxWidth = 240;
    const maxHeight = 160;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const x = 50 + column * (maxWidth + 30);
    const y = imageYOffset - row * (maxHeight + 30);
    const name = `/Im${index + 1}`;
    contentLines.push(`q ${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm ${name} Do Q`);
  });

  const contentStream = contentLines.join("\n") + "\n";
  const contentData = encoder.encode(contentStream);
  const contentObject = encoder.encode(
    `4 0 obj\n<< /Length ${contentData.length} >>\nstream\n`
  );
  const contentEnd = encoder.encode("\nendstream\nendobj\n");
  const contentCombined = new Uint8Array(
    contentObject.length + contentData.length + contentEnd.length
  );
  contentCombined.set(contentObject, 0);
  contentCombined.set(contentData, contentObject.length);
  contentCombined.set(contentEnd, contentObject.length + contentData.length);

  const xObjectEntries = imageObjectIds
    .map((id, index) => `/Im${index + 1} ${id} 0 R`)
    .join(" ");
  const pageResources = `<< /Font << /F1 5 0 R >> ${
    xObjectEntries ? `/XObject << ${xObjectEntries} >>` : ""
  } >>`;

  const objectsText = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources ${pageResources} >>\nendobj\n`,
    contentCombined,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  const encodedObjects: Array<{ id: number; data: Uint8Array }> = [
    { id: 1, data: encoder.encode(objectsText[0] as string) },
    { id: 2, data: encoder.encode(objectsText[1] as string) },
    { id: 3, data: encoder.encode(objectsText[2] as string) },
    { id: 4, data: objectsText[3] as Uint8Array },
    { id: 5, data: encoder.encode(objectsText[4] as string) },
    ...objects,
  ];

  const offsets: number[] = [];
  let currentOffset = header.length;
  encodedObjects.forEach((obj) => {
    offsets.push(currentOffset);
    parts.push(obj.data);
    currentOffset += obj.data.length;
  });

  const xrefStart = currentOffset;
  const xrefLines = ["xref", `0 ${encodedObjects.length + 1}`, "0000000000 65535 f "];
  offsets.forEach((offset) => {
    xrefLines.push(`${offset.toString().padStart(10, "0")} 00000 n `);
  });

  const trailer = [
    "trailer",
    `<< /Size ${encodedObjects.length + 1} /Root 1 0 R >>`,
    "startxref",
    `${xrefStart}`,
    "%%EOF\n",
  ];
  parts.push(encoder.encode(xrefLines.join("\n") + "\n" + trailer.join("\n")));

  return new Blob(parts, { type: "application/pdf" });
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
  const [pdfImageFailures, setPdfImageFailures] = useState(0);
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
    let cancelled = false;
    const buildPreview = async () => {
      if (!modalOpen) {
        setPdfPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
        setPdfImageFailures(0);
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
      const attachments = getClaimAttachments(activeClaim);
      const imageAttachments = attachments.filter((attachment) =>
        attachment.type.startsWith("image/")
      );
      const { images, failedCount } = await loadClaimImages(
        imageAttachments.map((attachment) => attachment.url)
      );
      const blob = await buildPdfBlob(pdfLines, images);
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
      setPdfImageFailures(failedCount);
    };

    void buildPreview();
    return () => {
      cancelled = true;
    };
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

  const handleDownloadPdf = async (claim: DamageClaim) => {
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
    const attachments = getClaimAttachments(claim);
    const imageAttachments = attachments.filter((attachment) =>
      attachment.type.startsWith("image/")
    );
    const { images, failedCount } = await loadClaimImages(
      imageAttachments.map((attachment) => attachment.url)
    );
    const pdfLinesWithNotice = failedCount
      ? [...pdfLines, "", `Note: ${failedCount} photo(s) could not be embedded due to CORS.`]
      : pdfLines;
    const blob = await buildPdfBlob(pdfLinesWithNotice, images);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `damage-claim-${claim.chassisNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
                  {pdfImageFailures > 0 && (
                    <div className="mt-2 text-xs text-amber-600">
                      {pdfImageFailures} photo(s) could not be embedded due to browser CORS restrictions.
                    </div>
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
