import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ClipboardCheck, Truck, Warehouse } from "lucide-react";

const WorkflowPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card className="border-border/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-sky-500/20 text-sky-200" variant="secondary">
              Workflow Guide
            </Badge>
            <Badge className="bg-emerald-500/20 text-emerald-200" variant="secondary">
              Updated hourly
            </Badge>
          </div>
          <CardTitle className="text-2xl">Dispatching Workflow & Operating Playbook</CardTitle>
          <CardDescription className="text-slate-300">
            A professional, step-by-step guide to how the website works and how to complete dispatching tasks from
            visibility to delivery confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Warehouse className="h-4 w-4 text-sky-300" />
                Why caravans appear
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Caravans are listed only after SAP production stock is moved into the transport warehouse. If it is not
                moved, it will not appear on the site. Data refreshes every hour.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <ClipboardCheck className="h-4 w-4 text-emerald-300" />
                First actions
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Identify the caravan status, verify dealer checks, and report any mismatches to Planning before booking
                transport.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Truck className="h-4 w-4 text-orange-300" />
                Final delivery
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Complete PGI in SAP, issue gate pass and evidence documents, and close the loop with POD and receipt
                confirmation.
              </p>
            </div>
          </div>

          <Separator className="bg-slate-800" />

          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6">
            <div className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-300">KPI Focus</div>
            <h4 className="mt-3 text-2xl font-semibold text-slate-100">Performance targets</h4>
            <ul className="mt-4 list-inside list-disc space-y-3 text-base text-slate-200">
              <li>Dispatch caravans within 3 days after transfer into your warehouse.</li>
              <li>All documents must be completed and returned.</li>
              <li>SAP stock, PGI, and receipt postings must be accurate and complete.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Status glossary</CardTitle>
            <CardDescription>Use this reference when you first see a caravan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <div className="flex flex-wrap items-start gap-2">
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Waiting for dispatch</Badge>
              <span className="text-slate-600">
                Caravans ready to be dispatched (waitingfordispatch).
              </span>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Badge className="border-sky-200 bg-sky-50 text-sky-700">Snowy stock</Badge>
              <span className="text-slate-600">
                Dealer is not confirmed; Sales must finalize the sale before dispatch.
              </span>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Badge className="border-violet-200 bg-violet-50 text-violet-700">Booked</Badge>
              <span className="text-slate-600">Transport PO already generated in SAP.</span>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Badge className="border-amber-200 bg-amber-50 text-amber-700">On hold</Badge>
              <span className="text-slate-600">
                Temporarily blocked by dealer request, sales pause, production confirmation, or other official notice.
              </span>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Badge className="border-orange-200 bg-orange-50 text-orange-700">Temporary leaving</Badge>
              <span className="text-slate-600">Going to a show; do not book transport PO in the usual way.</span>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Badge className="border-yellow-200 bg-yellow-50 text-yellow-700">Invalid stock</Badge>
              <span className="text-slate-600">
                Shown in the system but the stock is questionable. Click and report to a supervisor for confirmation
                before dispatch.
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Data refresh note</CardTitle>
            <CardDescription>Keep expectations aligned with hourly updates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p className="text-slate-600">
              The website refreshes every hour. Newly transferred caravans may take time to appear, and SAP updates can
              briefly lag behind scheduling changes.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Step-by-step process (click to view details)</CardTitle>
          <CardDescription>
            Each phase expands with exact checks, actions, and documentation requirements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              {
                title: "Step 1 — Confirm visibility & understand why a caravan appears",
                content: (
                  <>
                    <p>
                      The site only displays caravans that have been transferred from SAP production stock into the
                      transport warehouse. If a unit has not been moved, it will not show on the website.
                    </p>
                    <p>Data refreshes every hour, so newly moved units may take time to appear.</p>
                  </>
                ),
              },
              {
                title: "Step 2 — Classify the caravan status",
                content: (
                  <ul className="list-inside list-disc space-y-1">
                    <li>Waiting for dispatch: caravan is ready to be sent to dealer.</li>
                    <li>Snowy stock: dealer not confirmed; wait for Sales to sell/assign.</li>
                    <li>Booked: SAP transport PO already generated.</li>
                    <li>On hold: temporarily blocked by dealer, sales, or production notice.</li>
                    <li>Temporary leaving: going to a show; do not book transport PO normally.</li>
                    <li>
                      Invalid stock: system shows inventory but there is a stock doubt; click to flag and report to a
                      supervisor for verification.
                    </li>
                  </ul>
                ),
              },
              {
                title: "Step 3 — Dealer check & reallocation validation",
                content: (
                  <>
                    <p>
                      Confirm the dealer check is OK by verifying SAP data and schedule data match the final
                      reallocation. Urgent dealer changes can create temporary mismatches.
                    </p>
                    <p>
                      Use the Report action to automatically email Planning for review. Planning will verify and
                      respond before you proceed.
                    </p>
                  </>
                ),
              },
              {
                title: "Step 4 — Book transport time & company",
                content: (
                  <>
                    <p>
                      Select the dispatch time and transport company. The system emails Procurement automatically.
                      Once a carrier is confirmed, Sales cannot change the dealer without contacting you directly.
                    </p>
                    <p>When the supplier PO is available, you can continue with normal dispatch.</p>
                  </>
                ),
              },
              {
                title: "Step 5 — Print documents & execute PGI",
                content: (
                  <ul className="list-inside list-disc space-y-1">
                    <li>Click Print Doc, select the caravans, and confirm all information is complete.</li>
                    <li>Manual input is allowed in urgent cases; ensure missing documents are completed afterward.</li>
                    <li>Complete PGI in SAP — this step is critical before dispatch.</li>
                  </ul>
                ),
              },
              {
                title: "Step 6 — Delivery documents & receipt confirmation",
                content: (
                  <ul className="list-inside list-disc space-y-1">
                    <li>
                      Transport Gate Pass: record driver details and inspect for damage. Driver submits it to the gate
                      guard.
                    </li>
                    <li>
                      Transportation Evidence: returned by the driver or carrier after delivery, signed by the
                      receiver.
                    </li>
                    <li>Proof of Delivery: dealer signs and returns after receiving the caravan.</li>
                    <li>
                      Once documents return, you and Procurement will receive an email confirmation, then complete SAP
                      goods receipt.
                    </li>
                  </ul>
                ),
              },
              {
                title: "Step 7 — Damage reporting & KPI tracking",
                content: (
                  <>
                    <p>
                      If severe transport damage is reported, log it in the Transport Damage page so Procurement can
                      claim against the carrier and track KPI impacts.
                    </p>
                    <p>
                      Use PGI History to review every dispatched caravan and receipt record to manage your KPI
                      performance.
                    </p>
                  </>
                ),
              },
            ].map((step, index) => (
              <details
                key={step.title}
                className="group rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                      {index + 1}
                    </span>
                    {step.title}
                  </span>
                  <span className="text-xs text-slate-400 group-open:rotate-180">▾</span>
                </summary>
                <div className="mt-3 space-y-2 text-sm text-slate-600">{step.content}</div>
              </details>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Troubleshooting</CardTitle>
          <CardDescription>Clear owner assignment for quick issue resolution.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Issue</th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="px-4 py-3 text-slate-600">No PO created yet</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">Purchasing Officer Karen Andrew</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-slate-600">SAP PGI or Goods Issue problems</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">SAP Master Stefan Peng</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-slate-600">SAP data or website data mismatch</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">Planning Team</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-slate-600">Caravan not transferred into transport warehouse</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">Production (Maria)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-slate-600">System updates, suggestions, or errors</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">Zhihai Yan</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            Questions or system improvement requests: contact
            <a className="ml-1 font-semibold text-slate-900" href="mailto:yan@regentrv.com.au">
              yan@regentrv.com.au
            </a>
            , Zhihai Yan (Planning Manager).
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkflowPage;
