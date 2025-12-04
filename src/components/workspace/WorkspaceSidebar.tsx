import { Badge } from "@/components/ui/badge";
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
];

interface WorkspaceSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({ collapsed = false, onToggle }) => {
  return (
    <aside
      className={`relative flex h-full min-h-[560px] flex-col gap-3 rounded-xl border border-border/70 bg-background/90 p-3 shadow-sm backdrop-blur transition-[width] ${
        collapsed ? "w-16" : "w-[270px] lg:w-[300px]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        {!collapsed && <CardTitle className="text-base">Workspace</CardTitle>}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelRight className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </Button>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
              DW
            </div>
            {!collapsed && (
              <div>
                <CardTitle className="text-lg">Dispatch Workspace</CardTitle>
                <p className="text-sm text-muted-foreground">Realtime stock & dispatch monitor</p>
              </div>
            )}
          </div>
          {!collapsed && (
            <Badge variant="secondary" className="gap-2 px-2.5 py-1 text-[11px]">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Live
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const linkContent = (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive ? "border-primary/60 bg-primary/10 text-primary" : "border-border/80 bg-background text-foreground"
                  } ${collapsed ? "justify-center" : "justify-start"}`
                }
                end
              >
                <Icon className="h-4 w-4" />
                {!collapsed && item.label}
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
