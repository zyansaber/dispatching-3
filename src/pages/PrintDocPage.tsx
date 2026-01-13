import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDashboardContext } from "@/pages/Index";

const formatDate = (value: Date) =>
  value.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

const formatDateTime = (value: Date) =>
  value.toLocaleString("en-AU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const toChassisKey = (value?: string | null) => value?.toString().trim() || "";

const PrintDocPage: React.FC = () => {
  const { dispatchProcessed } = useDashboardContext();
  const [generatedAt, setGeneratedAt] = useState(() => new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedChassis, setSelectedChassis] = useState<Set<string>>(new Set());
  const [titleImageError, setTitleImageError] = useState(false);

  const bookedRows = useMemo(() => {
    return dispatchProcessed.filter((entry) => {
      const poNo = entry["Matched PO No"];
      return typeof poNo === "string" ? poNo.trim().length > 0 : Boolean(poNo);
    });
  }, [dispatchProcessed]);

  const filteredBookedRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return bookedRows;
    return bookedRows.filter((entry) => {
      const chassis = toChassisKey(entry["Chassis No"] || entry.dispatchKey);
      return chassis.toLowerCase().includes(keyword);
    });
  }, [bookedRows, searchTerm]);

  const selectedRows = useMemo(() => {
    return bookedRows.filter((entry) => {
      const chassis = toChassisKey(entry["Chassis No"] || entry.dispatchKey);
      return chassis && selectedChassis.has(chassis);
    });
  }, [bookedRows, selectedChassis]);

  const transportCompaniesForSelection = useMemo(() => {
    const companies = new Set<string>();
    selectedRows.forEach((row) => {
      const company = row.TransportCompany;
      if (typeof company === "string" && company.trim().length > 0) {
        companies.add(company.trim());
      }
    });
    return Array.from(companies);
  }, [selectedRows]);

  const warnings = useMemo(() => {
    const items: string[] = [];
    selectedRows.forEach((row) => {
      const chassis = toChassisKey(row["Chassis No"] || row.dispatchKey) || "Unknown chassis";
      const poNo = row["Matched PO No"];
      if (!(typeof poNo === "string" ? poNo.trim().length > 0 : Boolean(poNo))) {
        items.push(`${chassis}: Missing PO number.`);
      }
      const companyValue = row.TransportCompany;
      if (!(typeof companyValue === "string" ? companyValue.trim().length > 0 : Boolean(companyValue))) {
        items.push(`${chassis}: Missing Transport Company.`);
      }
      const sapDealer = row["SAP Data"];
      if (!sapDealer || (typeof sapDealer === "string" && sapDealer.trim().length === 0)) {
        items.push(`${chassis}: Missing SAP Data dealer.`);
      }
    });
    return items;
  }, [selectedRows]);

  const poNumbers = useMemo(() => {
    const entries = selectedRows
      .map((row) => row["Matched PO No"])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    return Array.from(new Set(entries)).join(", ");
  }, [selectedRows]);

  const transportCompanyLabel = transportCompaniesForSelection.length
    ? transportCompaniesForSelection.join(", ")
    : "________________________";

  const renderRows = selectedRows.length
    ? selectedRows
    : [{ "Chassis No": "", "Vin Number": "", "SAP Data": "" }];

  const toggleSelection = (chassis: string) => {
    setSelectedChassis((prev) => {
      const next = new Set(prev);
      if (next.has(chassis)) {
        next.delete(chassis);
      } else {
        next.add(chassis);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedChassis(new Set());

  return (
    <div className="print-doc-wrapper">
      <div className="print-hide mb-6 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Print Doc</h2>
          <p className="text-sm text-slate-500">
            Build a transport gate pass by selecting booked chassis and printing the page below.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Chassis search</label>
            <Input
              placeholder="Search booked chassis..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200">
              {filteredBookedRows.length ? (
                filteredBookedRows.map((row) => {
                  const chassis = toChassisKey(row["Chassis No"] || row.dispatchKey);
                  const isChecked = selectedChassis.has(chassis);
                  return (
                    <label
                      key={chassis}
                      className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm text-slate-700 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelection(chassis)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <div className="flex flex-1 flex-col">
                        <span className="font-medium text-slate-900">{chassis}</span>
                        <span className="text-xs text-slate-500">
                          PO: {row["Matched PO No"] || "-"} · SAP: {row["SAP Data"] || "-"}
                        </span>
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-sm text-slate-500">No booked chassis match this search.</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Clear selection
              </Button>
              <span className="text-xs text-slate-500">Selected: {selectedRows.length}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setGeneratedAt(new Date())}>
                Refresh Date &amp; Time
              </Button>
              <Button
                onClick={() => {
                  setGeneratedAt(new Date());
                  window.print();
                }}
              >
                Print Gate Pass
              </Button>
            </div>

            {warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <div className="font-semibold">Selection warnings</div>
                <ul className="list-disc pl-5">
                  {warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-xs text-slate-500">
              Transport Company: {transportCompanyLabel}
            </div>
          </div>
        </div>
      </div>

      <section className="print-page">
        <div className="print-page__header">
          {!titleImageError ? (
            <img
              src="/company-title.png"
              alt="Company title"
              className="print-page__title-image"
              onError={() => setTitleImageError(true)}
            />
          ) : (
            <div className="print-page__title-placeholder">
              Upload <strong>company-title.png</strong> into <code>/public</code>
            </div>
          )}
        </div>

        <div className="print-page__content print-page__content--compact">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-wide text-slate-900">Transport Gate Pass</h1>
            <p className="text-sm leading-relaxed text-slate-600">
              I have checked caravan chassis number/s listed below. The van/s are without damage and
              are secure and ready for transport.
              <br />
              <br />
              I acknowledge that I am responsible for all damage caused during the initial loading,
              transporting and final unloading of these caravans at their final dealer destination.
              <br />
              <br />
              <strong className="text-slate-900">
                ANY DAMAGE MUST BE DECLARED AND RECORDED BY TRANSPORT COMPANY BEFORE LOADING.
              </strong>
            </p>
          </div>

          <div className="mt-6">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Chassis Number</th>
                  <th>VIN Number</th>
                  <th>Destination Dealership (SAP Data)</th>
                </tr>
              </thead>
              <tbody>
                {renderRows.map((row, index) => (
                  <tr key={row["Chassis No"] || `placeholder-${index}`}>
                    <td>{row["Chassis No"] || ""}</td>
                    <td>{row["Vin Number"] || (row as Record<string, any>)["VIN Number"] || ""}</td>
                    <td>{row["SAP Data"] || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>
              <div className="font-semibold text-slate-900">Date of collection:</div>
              <div>{formatDateTime(generatedAt)}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Transport Company:</div>
              <div>{transportCompanyLabel}</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-700">
            <div>Damage Noted: YES / NO</div>
            <div className="ml-auto">Driver’s signature: ____________________________</div>
          </div>

          <div className="mt-8">
            <div className="text-sm font-semibold text-slate-900">External Caravan Checklist</div>
            <p className="mt-1 text-sm text-slate-600">
              Please review the caravan exterior and note any visible damage.
            </p>
            <table className="print-table print-checklist mt-3">
              <thead>
                <tr>
                  <th>Checklist Item</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[
                  "Body panels and paint",
                  "Windows / glass",
                  "Doors and seals",
                  "Tyres and rims",
                  "Undercarriage",
                ].map((item) => (
                  <tr key={item}>
                    <td>{item}</td>
                    <td>☐ OK &nbsp;&nbsp; ☐ Damage</td>
                    <td>________________________________________</td>
                  </tr>
                ))}
                <tr>
                  <td>Other</td>
                  <td>☐ OK &nbsp;&nbsp; ☐ Damage</td>
                  <td>________________________________________</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>SR Security’s signature: ____________________________</div>
            <div>Purchase Order #: {poNumbers || "________________________"}</div>
          </div>

          <div className="mt-10 text-sm text-slate-500">
            Generated {formatDate(generatedAt)} · Selected chassis: {selectedRows.length}
          </div>
        </div>
      </section>

      <section className="print-page">
        <div className="print-page__header">
          {!titleImageError ? (
            <img
              src="/company-title.png"
              alt="Company title"
              className="print-page__title-image"
              onError={() => setTitleImageError(true)}
            />
          ) : (
            <div className="print-page__title-placeholder">
              Upload <strong>company-title.png</strong> into <code>/public</code>
            </div>
          )}
        </div>

        <div className="print-page__content">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-slate-900">Transportation Evidence</h2>
            <div className="text-sm text-slate-500">Generated {formatDate(generatedAt)}</div>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            Record arrival condition and capture signature for transported caravans.
          </p>

          <div className="mt-5">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Chassis Number</th>
                  <th>VIN Number</th>
                  <th>Destination Dealership (SAP Data)</th>
                </tr>
              </thead>
              <tbody>
                {renderRows.map((row, index) => (
                  <tr key={`${row["Chassis No"] || `placeholder-${index}`}-evidence`}>
                    <td>{row["Chassis No"] || ""}</td>
                    <td>{row["Vin Number"] || (row as Record<string, any>)["VIN Number"] || ""}</td>
                    <td>{row["SAP Data"] || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>
              <div className="font-semibold text-slate-900">Arrival Time:</div>
              <div>____________________________</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Damage Noted:</div>
              <div>YES / NO</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>
              <div className="font-semibold text-slate-900">Transport Company:</div>
              <div>{transportCompanyLabel}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Purchase Order #:</div>
              <div>{poNumbers || "________________________"}</div>
            </div>
          </div>

          <div className="mt-6 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Damage Details (if YES)</div>
            <div className="print-input-box mt-2" />
          </div>

          <div className="mt-6 text-sm text-slate-700">
            Driver/Transport Representative Signature: ____________________________
          </div>

          <div className="mt-6 print-note">
            Please scan and return this document to Snowy River Caravan.
          </div>
        </div>
      </section>

      <section className="print-page">
        <div className="print-page__header">
          {!titleImageError ? (
            <img
              src="/company-title.png"
              alt="Company title"
              className="print-page__title-image"
              onError={() => setTitleImageError(true)}
            />
          ) : (
            <div className="print-page__title-placeholder">
              Upload <strong>company-title.png</strong> into <code>/public</code>
            </div>
          )}
        </div>

        <div className="print-page__content">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-slate-900">Proof of Delivery</h2>
            <div className="text-sm text-slate-500">Generated {formatDate(generatedAt)}</div>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            Dealer acknowledgement of delivery condition and receipt time.
          </p>

          <div className="mt-5">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Chassis Number</th>
                  <th>VIN Number</th>
                  <th>Destination Dealership (SAP Data)</th>
                </tr>
              </thead>
              <tbody>
                {renderRows.map((row, index) => (
                  <tr key={`${row["Chassis No"] || `placeholder-${index}`}-delivery`}>
                    <td>{row["Chassis No"] || ""}</td>
                    <td>{row["Vin Number"] || (row as Record<string, any>)["VIN Number"] || ""}</td>
                    <td>{row["SAP Data"] || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>
              <div className="font-semibold text-slate-900">Delivery Time:</div>
              <div>____________________________</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Damage Noted:</div>
              <div>YES / NO</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>
              <div className="font-semibold text-slate-900">Transport Company:</div>
              <div>{transportCompanyLabel}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Purchase Order #:</div>
              <div>{poNumbers || "________________________"}</div>
            </div>
          </div>

          <div className="mt-6 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Damage Details (if YES)</div>
            <div className="print-input-box mt-2" />
          </div>

          <div className="mt-6 text-sm text-slate-700">
            Dealer Signature: ____________________________
          </div>

          <div className="mt-6 print-note">
            Please scan and return this document to Snowy River Caravan.
          </div>
        </div>
      </section>
    </div>
  );
};

export default PrintDocPage;
