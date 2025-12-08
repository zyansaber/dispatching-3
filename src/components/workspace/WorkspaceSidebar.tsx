import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NavLink } from "react-router-dom";
import {
  ArrowLeftRight,
  BarChart3,
  Factory,
  PanelLeft,
  PanelRight,
  Settings,
  Package,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

const navItems: WorkspaceNavItem[] = [
  { to: "/dispatch", label: "Dealer Orders", icon: BarChart3, end: true },
  { to: "/stock", label: "Factory & Yard", icon: Factory, end: true },
  { to: "/reallocation", label: "Reallocation", icon: ArrowLeftRight, end: true },
  { to: "/admin", label: "Admin", icon: Settings, end: true },
];

interface WorkspaceSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  stats?: {
    total?: number;
    canBeDispatched?: number;
    snowyStock?: number;
  };
}

const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({ collapsed = false, onToggle, stats }) => {
  const totals = {
    total: stats?.total ?? 0,
    ready: stats?.canBeDispatched ?? 0,
    snowy: stats?.snowyStock ?? 0,
  };

  return (
    <aside
      className={`sticky top-4 z-20 flex self-start min-h-[560px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 text-slate-50 shadow-xl transition-all duration-300 ease-in-out sm:top-6 ${
        collapsed ? "w-[80px]" : "w-[288px] lg:w-[304px]"
      }`}
    >
      <div className="flex h-full flex-1 flex-col">
        <div className="relative flex items-center gap-3 border-b border-slate-800 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
            <img
              src="/assets/snowy-river-logo.svg"
              alt="Snowy River Caravans"
              className="h-9 w-9 object-contain"
            />
          </div>
          {!collapsed && (
            <div className="space-y-0.5">
              <h1 className="text-base font-semibold leading-tight">Dealer Portal</h1>
              <p className="text-sm text-slate-300">Orders and inventory</p>
            </div>
          )}
        </div>

        <div className="border-b border-slate-800 px-3 py-3">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink key={item.label} to={item.to} end={item.end}>
                {({ isActive }) => (
                  <Button
                    variant="ghost"
                    className={`flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      collapsed ? "justify-center px-2" : ""
                    } ${
                      isActive
                        ? "bg-slate-800 text-white shadow-inner"
                        : "text-slate-200 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    {!collapsed && <span>{item.label}</span>}
                    {collapsed && <span className="sr-only">{item.label}</span>}
                  </Button>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="px-4 py-4">
          {!collapsed && (
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Workspace Overview</div>
          )}
          <div className="grid grid-cols-1 gap-3">
            <Card className="border border-slate-800 bg-slate-900 shadow-inner">
              <CardHeader className={`pb-2 ${collapsed ? "p-3" : "px-4 pt-4 pb-2"}`}>
                <CardTitle className="flex items-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                  <Package className={`h-3.5 w-3.5 ${collapsed ? "" : "mr-2"}`} />
                  {!collapsed && <span>Total Orders</span>}
                  {collapsed && <span className="sr-only">Total Orders</span>}
                  <Badge variant="secondary" className="ml-auto bg-slate-800 text-slate-50">
                    Ready {totals.ready}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className={`${collapsed ? "p-3" : "px-4 pb-4 pt-1"}`}>
                <div className="text-2xl font-bold text-white">{totals.total}</div>
                {!collapsed && <p className="mt-1 text-xs text-slate-400">Snowy stock: {totals.snowy}</p>}
              </CardContent>
            </Card>
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
