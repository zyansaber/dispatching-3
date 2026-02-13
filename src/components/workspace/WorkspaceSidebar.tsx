import React, { type ComponentType, type SVGProps, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NavLink } from "react-router-dom";
import {
  ClipboardList,
  LayoutDashboard,
  PanelLeft,
  PanelRight,
  Package,
  Printer,
  Ticket,
  ShieldCheck,
  FileWarning,
  FileText,
  History,
  SlidersHorizontal,
} from "lucide-react";
import type { SidebarFilter } from "@/pages/Index";

export type WorkspaceNavItem = {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
};

const navItems: WorkspaceNavItem[] = [
  { to: "/stock", label: "Stock Sheet", icon: ClipboardList, end: true },
  { to: "/dispatch", label: "Dispatch Dashboard", icon: LayoutDashboard, end: true },
  { to: "/transport-damage", label: "Transport Damage", icon: FileWarning, end: true },
  { to: "/transport-preference", label: "Transport Preference", icon: SlidersHorizontal, end: true },
  { to: "/pgi-history", label: "PGI History", icon: History, end: true },
  { to: "/service-ticket", label: "Service Ticket", icon: Ticket, end: true },
  { to: "/admin", label: "Admin", icon: ShieldCheck, end: true },
  { to: "/workflow", label: "Workflow Guide", icon: FileText, end: true },
];

interface WorkspaceSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  stats?: {
    total?: number;
    canBeDispatched?: number;
    snowyStock?: number;
    onHold?: number;
    booked?: number;
    transportNoPO?: number;
    grRanges?: Array<{ label: string; min: number; max?: number | null; count: number }>;
  };
  onSelectGRRange?: (range: SidebarFilter | null) => void;
}

const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  collapsed = false,
  onToggle,
  stats,
  onSelectGRRange,
}) => {
  const totals = {
    total: stats?.total ?? 0,
    ready: stats?.canBeDispatched ?? 0,
    snowy: stats?.snowyStock ?? 0,
    onHold: stats?.onHold ?? 0,
    booked: stats?.booked ?? 0,
    transportNoPO: stats?.transportNoPO ?? 0,
  };

  const grRanges = stats?.grRanges || [];
  const maxRangeCount = useMemo(() => Math.max(...grRanges.map((r) => r.count || 0), 1), [grRanges]);
  const barColors = [
    "linear-gradient(90deg, #38bdf8, #3b82f6)",
    "linear-gradient(90deg, #22c55e, #16a34a)",
    "linear-gradient(90deg, #f97316, #ea580c)",
    "linear-gradient(90deg, #a855f7, #7c3aed)",
    "linear-gradient(90deg, #eab308, #ca8a04)",
    "linear-gradient(90deg, #06b6d4, #0891b2)",
  ];

  return (
    <aside
      className="fixed left-0 top-0 z-20 flex h-screen flex-col overflow-x-hidden overflow-y-auto border-r border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 text-slate-50 shadow-xl transition-all duration-300 ease-in-out"
      style={{
        width: collapsed
          ? "var(--workspace-sidebar-collapsed-width)"
          : "var(--workspace-sidebar-width)",
      }}
    >
      <div className="flex h-full flex-1 flex-col">
        <div className="border-b border-slate-800 px-3 py-3">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Tooltip key={item.label} disableHoverableContent={!collapsed} delayDuration={120}>
                <TooltipTrigger asChild>
                  <NavLink to={item.to} end={item.end}>
                    {({ isActive }) => (
                      <Button
                        variant="ghost"
                        className={`group relative flex w-full items-center justify-start gap-3 rounded-lg px-3 py-3 text-base font-medium transition ${
                          collapsed ? "justify-center px-2 text-sm" : ""
                        } ${
                          isActive
                            ? "bg-slate-800 text-white shadow-inner ring-1 ring-slate-700"
                            : "text-slate-200 hover:bg-slate-800 hover:text-white"
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-md border text-slate-100 shadow-sm transition ${
                            isActive
                              ? "border-slate-600 bg-slate-800"
                              : "border-slate-800 bg-slate-900 group-hover:border-slate-700"
                          }`}
                        >
                          <item.icon className="h-5 w-5" />
                        </span>
                        {!collapsed && <span className="truncate text-left leading-tight">{item.label}</span>}
                        {collapsed && <span className="sr-only">{item.label}</span>}
                      </Button>
                    )}
                  </NavLink>
                </TooltipTrigger>
                {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
              </Tooltip>
            ))}
          </nav>
        </div>

        <div className="border-b border-slate-800 px-3 pb-3 pt-2">
          <Tooltip delayDuration={120} disableHoverableContent={!collapsed}>
            <TooltipTrigger asChild>
              <NavLink to="/print-doc" end>
                {({ isActive }) => (
                  <div
                    className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                      collapsed ? "justify-center" : ""
                    } ${
                      isActive
                        ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-50 shadow-inner"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/70 hover:bg-emerald-500/20"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-md border border-emerald-400/50 bg-emerald-500/20 shadow-sm ${
                        collapsed ? "" : ""
                      }`}
                    >
                      <Printer className="h-4 w-4" />
                    </span>
                    {!collapsed && <span className="leading-tight">Print Doc</span>}
                    {collapsed && <span className="sr-only">Print Doc</span>}
                  </div>
                )}
              </NavLink>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Print Doc</TooltipContent>}
          </Tooltip>
        </div>

        {!collapsed && (
          <div className="px-4 py-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Workspace Overview</div>
            <div className="grid grid-cols-1 gap-3">
              <Card className="border border-slate-800 bg-slate-900 shadow-inner">
                <CardHeader className="px-4 pt-4 pb-2">
                  <CardTitle className="flex items-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                    <Package className="mr-2 h-3.5 w-3.5" />
                    <span>Total Orders</span>
                    <Badge variant="secondary" className="ml-auto bg-slate-800 text-slate-50">
                      Ready {totals.ready}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-1">
                  <div className="text-2xl font-bold text-white">{totals.total} entries</div>
                  <p className="mt-1 text-xs text-slate-400">Snowy stock: {totals.snowy}</p>
                </CardContent>
              </Card>

            </div>
          </div>
        )}

        <div className="border-t border-slate-800 px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            {!collapsed && (
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                GR to GI Days for Can Dispatch
              </div>
            )}
            <Badge
              variant="secondary"
              className="bg-slate-800 text-[11px] font-semibold text-slate-50"
            >
              {totals.ready} ready
            </Badge>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3">
            <div className="flex items-end justify-between gap-2">
              {grRanges.map((bucket, index) => {
                const width = Math.max((bucket.count / maxRangeCount) * 100, 6);
                const color = barColors[index % barColors.length];

                return (
                  <Tooltip key={bucket.label} delayDuration={120}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() =>
                          onSelectGRRange?.({
                            kind: "grRange",
                            label: bucket.label,
                            min: bucket.min,
                            max: bucket.max,
                          })
                        }
                        className={`group flex flex-1 flex-col items-center justify-end rounded-md border border-slate-800 bg-slate-900/80 px-2 py-2 text-center transition hover:border-blue-500 ${
                          collapsed ? "min-w-[48px]" : ""
                        }`}
                      >
                        <div className="flex h-24 w-full items-end justify-center">
                          <div
                            className="w-6 rounded-t-md transition"
                            style={{ height: `${width}%`, background: color }}
                          />
                        </div>
                        {!collapsed && (
                          <div className="mt-2 text-[11px] font-semibold text-slate-200">
                            <span className="inline-block origin-top-left -rotate-30 whitespace-nowrap">
                              {bucket.label}
                            </span>
                          </div>
                        )}
                        {!collapsed && (
                          <div className="text-[10px] text-slate-400">{bucket.count}</div>
                        )}
                        {collapsed && <span className="sr-only">{bucket.label}</span>}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      <div className="font-semibold">{bucket.label}</div>
                      <div className="text-slate-300">{bucket.count} caravans</div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-slate-800 px-3 py-3">
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggle}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 text-slate-100 shadow-sm transition hover:bg-slate-700"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelRight className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? "Expand" : "Collapse"}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
};

export default WorkspaceSidebar;
