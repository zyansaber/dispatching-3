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
  const asideWidth = collapsed ? "w-[72px]" : "w-[270px] lg:w-[300px]";

  return (
    <aside
      className={`relative flex h-full min-h-[560px] flex-col gap-3 rounded-xl border border-border/70 bg-background/90 ${
        collapsed ? "p-2" : "p-3"
      } shadow-sm backdrop-blur transition-[width] ${asideWidth}`}
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
        <CardHeader
          className={`pb-3 ${
            collapsed ? "flex flex-col items-center space-y-2" : "flex flex-row items-start justify-between space-y-0"
          }`}
        >
          <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
            <div className="relative flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
              DW
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" />
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
                  `group relative flex w-full items-center gap-2 rounded-md border text-sm transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive ? "border-primary/60 bg-primary/10 text-primary" : "border-border/80 bg-background text-foreground"
                  } ${
                    collapsed
                      ? "h-12 justify-center px-2"
                      : "h-11 justify-start px-3"
                  }`
                }
                end
                aria-label={item.label}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`absolute left-1 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-full bg-primary transition ${
                        collapsed ? "" : "left-2"
                      } ${isActive ? "opacity-100" : "opacity-0"}`}
                    />
                    <Icon className="h-4 w-4" aria-hidden />
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
