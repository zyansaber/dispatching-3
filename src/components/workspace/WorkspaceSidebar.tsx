import React, { type ComponentType, type SVGProps, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  PanelLeft,
  PanelRight,
  Package,
  PauseCircle,
  Repeat,
  ShieldCheck,
  Truck,
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
  { to: "/reallocation", label: "Reallocation", icon: Repeat, end: true },
  { to: "/admin", label: "Admin", icon: ShieldCheck, end: true },
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

  return (
    <aside
      className={`fixed left-0 top-0 z-20 flex h-screen flex-col overflow-hidden border-r border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 text-slate-50 shadow-xl transition-all duration-300 ease-in-out ${
        collapsed ? "w-[80px]" : "w-[288px] lg:w-[304px]"
      }`}
    >
      <div className="flex h-full flex-1 flex-col">
        <div className="relative flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-4">
          {!collapsed && <h1 className="text-base font-semibold leading-tight">Workspace</h1>}
        </div>

        <div className="border-b border-slate-800 px-3 py-3">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Tooltip key={item.label} disableHoverableContent={!collapsed} delayDuration={120}>
                <TooltipTrigger asChild>
                  <NavLink to={item.to} end={item.end}>
                    {({ isActive }) => (
                      <Button
                        variant="ghost"
                        className={`group relative flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          collapsed ? "justify-center px-2 text-xs" : ""
                        } ${
                          isActive
                            ? "bg-slate-800 text-white shadow-inner ring-1 ring-slate-700"
                            : "text-slate-200 hover:bg-slate-800 hover:text-white"
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-md border text-slate-100 shadow-sm transition ${
                            isActive
                              ? "border-slate-600 bg-slate-800"
                              : "border-slate-800 bg-slate-900 group-hover:border-slate-700"
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
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
                  <div className="text-2xl font-bold text-white">{totals.total}</div>
                  <p className="mt-1 text-xs text-slate-400">Snowy stock: {totals.snowy}</p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Card className="border border-slate-800 bg-slate-900/80 shadow-inner">
                  <CardHeader className="px-4 pt-4 pb-2">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                      <PauseCircle className="h-3.5 w-3.5" />
                      <span>On Hold</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-1">
                    <div className="text-xl font-semibold text-white">{totals.onHold}</div>
                    <p className="mt-1 text-[11px] text-slate-400">Waiting for release</p>
                  </CardContent>
                </Card>
                <Card className="border border-slate-800 bg-slate-900/80 shadow-inner">
                  <CardHeader className="px-4 pt-4 pb-2">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                      <Truck className="h-3.5 w-3.5" />
                      <span>Booked</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-1">
                    <div className="text-xl font-semibold text-white">{totals.booked}</div>
                    <p className="mt-1 text-[11px] text-slate-400">Transport time set</p>
                  </CardContent>
                </Card>
                <Card className="border border-slate-800 bg-slate-900/80 shadow-inner sm:col-span-2">
                  <CardHeader className="px-4 pt-4 pb-2">
                    <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                      <BarChart3 className="h-3.5 w-3.5" />
                      <span>Transport time, no PO</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-1">
                    <div className="text-xl font-semibold text-white">{totals.transportNoPO}</div>
                    <p className="mt-1 text-[11px] text-slate-400">Bookings missing PO numbers</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-slate-800 px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            {!collapsed && (
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                GR Days for Can Dispatch
              </div>
            )}
            <Badge
              variant="secondary"
              className="bg-slate-800 text-[11px] font-semibold text-slate-50"
            >
              {totals.ready} ready
            </Badge>
          </div>
          <div className="flex items-end gap-2">
            {grRanges.map((bucket) => {
              const height = Math.max((bucket.count / maxRangeCount) * 100, 12);
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
                      className={`flex-1 rounded-md border border-slate-800 bg-gradient-to-t from-slate-800 to-slate-700 transition hover:border-blue-500 hover:from-blue-900 hover:to-blue-700 ${
                        collapsed ? "min-w-[10px]" : "min-w-[40px]"
                      }`}
                      style={{ height: `${height}%`, minHeight: collapsed ? 40 : 56 }}
                    >
                      <span className="sr-only">{bucket.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    <div className="font-semibold">{bucket.label}</div>
                    <div className="text-slate-300">{bucket.count} vehicles</div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {!collapsed && (
            <div className="mt-2 text-[11px] text-slate-400">
              Click a bar to filter can-dispatch vehicles on the Dispatch page by GR Days range.
            </div>
          )}
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
