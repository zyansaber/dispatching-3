import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDashboardContext } from "@/pages/Index";
import { filterDispatchData } from "@/lib/firebase";

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

const PrintDocPage: React.FC = () => {
  const { dispatchProcessed, reallocRaw, transportCompanies } = useDashboardContext();
  const [transportCompany, setTransportCompany] = useState("");
  const [generatedAt, setGeneratedAt] = useState(() => new Date());

  const readyRows = useMemo(
    () => filterDispatchData(dispatchProcessed, "canBeDispatched", reallocRaw),
    [dispatchProcessed, reallocRaw]
  );

  const transportCompanyOptions = useMemo(
    () => Object.values(transportCompanies || {}).map((company) => company.name).filter(Boolean),
    [transportCompanies]
  );

  const poNumbers = useMemo(() => {
    const entries = readyRows
      .map((row) => row["Matched PO No"])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    return Array.from(new Set(entries)).join(", ");
  }, [readyRows]);

  const renderRows = readyRows.length
    ? readyRows
    : [{ "Chassis No": "", "Vin Number": "", "SAP Data": "" }];

  return (
    <div className="print-doc-wrapper">
      <div className="print-hide mb-6 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Print Doc</h2>
          <p className="text-sm text-slate-500">
            Generate a three-page transport document with gate pass, summary, and checklist details.
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Transport Company</label>
            <Input
              list="transport-company-options"
              placeholder="Enter transport company"
              value={transportCompany}
              onChange={(event) => setTransportCompany(event.target.value)}
              className="w-full lg:w-80"
            />
            <datalist id="transport-company-options">
              {transportCompanyOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setGeneratedAt(new Date())}>
              Refresh Date &amp; Time
            </Button>
            <Button onClick={() => {
              setGeneratedAt(new Date());
              window.print();
            }}>
              Print Document
            </Button>
          </div>
        </div>
      </div>

      <section className="print-page">
        <div className="print-page__header">
          <img
            src="/company-title.svg"
            alt="Company title"
            className="print-page__title-image"
          />
        </div>

        <div className="print-page__content">
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
              <div>{transportCompany || "________________________"}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>Driver’s name: ____________________________</div>
            <div>Driver’s Licence: ____________________________</div>
            <div>Driver’s vehicle registration number: ____________________________</div>
            <div>Driver’s signature: ____________________________</div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-700">
            <div>Damage Noted: YES / NO</div>
            <div className="ml-auto">Transport Manager confirmation: ____________________________</div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>SR Security’s signature: ____________________________</div>
            <div>Purchase Order #: {poNumbers || "________________________"}</div>
          </div>

          <div className="mt-6 text-sm text-slate-700">
            Release Date &amp; Time _____ / _____ / ________ &nbsp;&nbsp;&nbsp; __________ am / pm
          </div>
        </div>
      </section>

      <section className="print-page">
        <div className="print-page__header">
          <img
            src="/company-title.svg"
            alt="Company title"
            className="print-page__title-image"
          />
        </div>

        <div className="print-page__content">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-slate-900">Dispatch Summary</h2>
            <div className="text-sm text-slate-500">Generated {formatDate(generatedAt)}</div>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            Summary of can-dispatch vehicles included in this transport run.
          </p>

          <div className="mt-5">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Chassis No</th>
                  <th>SO Number</th>
                  <th>VIN Number</th>
                  <th>Customer</th>
                  <th>Model</th>
                  <th>SAP Data</th>
                  <th>Scheduled Dealer</th>
                  <th>Matched PO No</th>
                </tr>
              </thead>
              <tbody>
                {renderRows.map((row, index) => (
                  <tr key={`${row["Chassis No"] || `placeholder-${index}`}-summary`}>
                    <td>{row["Chassis No"] || ""}</td>
                    <td>{row["SO Number"] || ""}</td>
                    <td>{row["Vin Number"] || (row as Record<string, any>)["VIN Number"] || ""}</td>
                    <td>{row.Customer || ""}</td>
                    <td>{row.Model || ""}</td>
                    <td>{row["SAP Data"] || ""}</td>
                    <td>{row["Scheduled Dealer"] || ""}</td>
                    <td>{row["Matched PO No"] || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="print-page">
        <div className="print-page__header">
          <img
            src="/company-title.svg"
            alt="Company title"
            className="print-page__title-image"
          />
        </div>

        <div className="print-page__content">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-slate-900">Release Checklist</h2>
            <div className="text-sm text-slate-500">Total vehicles: {readyRows.length}</div>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            Confirm all documentation and safety checks are completed before release.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>Transport Company: {transportCompany || "________________________"}</div>
            <div>Collection Date: {formatDate(generatedAt)}</div>
            <div>Supervisor Name: ____________________________</div>
            <div>Contact Number: ____________________________</div>
          </div>

          <div className="mt-8">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Check Item</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[
                  "Vehicle condition verified",
                  "Keys and documents collected",
                  "Load securement complete",
                  "Transport documentation issued",
                  "Dealer destination confirmed",
                ].map((item) => (
                  <tr key={item}>
                    <td>{item}</td>
                    <td>☐ OK &nbsp;&nbsp; ☐ Issue</td>
                    <td>________________________________________</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 text-sm text-slate-700 md:grid-cols-2">
            <div>
              Dispatch Coordinator Signature: ________________________________
            </div>
            <div>
              Final Release Time: ____________ am / pm
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PrintDocPage;
