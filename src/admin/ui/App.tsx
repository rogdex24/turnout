import { CalendarDays, Database, History, VolumeX } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "./components/theme-toggle";
import { EventsPage } from "./pages/events";
import { MutesPage } from "./pages/mutes";
import { RunDetailPage } from "./pages/run-detail";
import { RunsPage } from "./pages/runs";
import { SourcesPage } from "./pages/sources";
import { Link, navigate, useLocation } from "./router";

const NAV = [
  { to: "/runs", label: "Runs", icon: History },
  { to: "/sources", label: "Sources", icon: Database },
  { to: "/events", label: "Events", icon: CalendarDays },
  { to: "/mutes", label: "Mutes", icon: VolumeX },
];

function Page({ path }: { path: string }): ReactNode {
  const run = /^\/runs\/([^/]+)$/.exec(path);
  // group 1 is mandatory in the pattern
  if (run) return <RunDetailPage key={run[1]} id={decodeURIComponent(run[1]!)} />;
  switch (path.replace(/\/+$/, "")) {
    case "/runs":
      return <RunsPage />;
    case "/sources":
      return <SourcesPage />;
    case "/events":
      return <EventsPage />;
    case "/mutes":
      return <MutesPage />;
    default:
      return <p className="text-muted-foreground text-sm">No such page. Pick one from the sidebar.</p>;
  }
}

export function App() {
  const { path } = useLocation();
  useEffect(() => {
    if (path === "/") navigate("/runs", { replace: true });
  }, [path]);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>hydsocial admin</SidebarGroupLabel>
            <SidebarMenu>
              {NAV.map(({ to, label, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton asChild isActive={path === to || path.startsWith(`${to}/`)}>
                    <Link to={to}>
                      <Icon />
                      {label}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <ThemeToggle />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
        </header>
        <div className="min-w-0 p-4 md:p-6">
          <Page path={path} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
