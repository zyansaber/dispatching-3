import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NavLink } from "react-router-dom";
import {
  ArrowLeftRight,
  ClipboardList,
  LayoutDashboard,
  PanelLeft,
  PanelRight,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const navItems: WorkspaceNavItem[] = [
  { to: "/stock", label: "Stock Sheet", icon: ClipboardList },
  { to: "/dispatch", label: "Dispatch Dashboard", icon: LayoutDashboard },
  { to: "/reallocation", label: "Reallocation", icon: ArrowLeftRight },
  { to: "/admin", label: "Admin", icon: Settings },
];

interface WorkspaceSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({ collapsed = false, onToggle }) => {
  const asideWidth = collapsed ? "w-[72px]" : "w-[270px] lg:w-[300px]";
  const padding = collapsed ? "p-2" : "p-3";

  return (
    <aside
      className={`relative sticky top-4 self-start min-h-[560px] flex flex-col gap-3 rounded-xl border border-border/70 bg-gradient-to-b from-slate-900 to-slate-950 text-slate-100 shadow-sm transition-[width] sm:top-6 ${padding} ${asideWidth}`}
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 bg-white/10 text-white hover:bg-white/20"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelRight className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </Button>
      </div>

      <Card className="border-none bg-white/5 shadow-lg">
        <CardHeader
          className={`pb-3 ${
            collapsed ? "flex flex-col items-center space-y-2" : "flex flex-row items-start justify-between space-y-0"
          }`}
        >
          <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
            <div className="relative flex h-11 w-11 items-center justify-center rounded-lg bg-white/15 text-white font-semibold">
              <span className="text-lg">🚚</span>
            </div>
            {!collapsed && (
              <div className="space-y-0.5">
                <CardTitle className="text-lg text-white">Dispatch Workspace</CardTitle>
                <p className="text-sm text-slate-200/80">Organize dispatch, stock, and reallocations.</p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const linkContent = (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `group relative flex w-full items-center gap-2 rounded-md text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:ring-white/60 ${
                    isActive
                      ? "bg-white text-slate-900 shadow-sm"
                      : "border border-white/10 bg-white/5 text-white hover:border-white/30 hover:bg-white/10"
                  } ${collapsed ? "h-12 justify-center px-2" : "h-11 justify-start px-3"}`
                }
                end
                aria-label={item.label}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`absolute left-1 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-full bg-white transition ${
                        collapsed ? "" : "left-2"
                      } ${isActive ? "opacity-80" : "opacity-0"}`}
                    />
                    <Icon className={isActive ? "h-4 w-4 text-slate-900" : "h-4 w-4 text-white"} aria-hidden />
                    {!collapsed && item.label}
                  </>
                )}
              </NavLink>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.to} delayDuration={150}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}
        </CardContent>
      </Card>
    </aside>
  );
};

export default WorkspaceSidebar;
