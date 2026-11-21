import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { Activity, ChevronsLeft, ChevronsRight, Command as CommandIcon, Database, Moon, Plus, Server, Settings, Sun, Users, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Kbd, StatusDot } from "@/components/ui/primitives";
import { platform } from "@/platform";
import { useRestartServer, useServerInfo, useSettings, useUpdateSettings } from "@/platform/hooks";

const navigation = [
  { to: "/connections", label: "Connections", icon: Database },
  { to: "/ai-clients", label: "AI Clients", icon: Users },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("dbmcp.sidebarCollapsed") === "true");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [platformName, setPlatformName] = useState<string>();
  const { data: serverInfo } = useServerInfo();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const restartServer = useRestartServer();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    void platform.getAppInfo().then((info) => setPlatformName(info.platform));
  }, []);

  useEffect(() => {
    localStorage.setItem("dbmcp.sidebarCollapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const dark = settings?.theme === "dark" || (settings?.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
    };
    applyTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [settings?.theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen(true); }
      if (mod && event.key.toLowerCase() === "n") { event.preventDefault(); navigate("/connections/new"); }
      if (mod && event.key === ",") { event.preventDefault(); navigate("/settings"); }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const status = serverInfo?.state === "healthy" ? "healthy" : serverInfo?.state === "unhealthy" || serverInfo?.state === "restarting" ? "warning" : "error";
  const pageTitle = useMemo(() => navigation.find((item) => location.pathname.startsWith(item.to))?.label ?? "Connections", [location.pathname]);
  const toggleTheme = () => {
    const next = settings?.theme === "dark" ? "light" : "dark";
    updateSettings.mutate({ theme: next });
  };
  const copyMcpUrl = async () => {
    if (!serverInfo?.mcpUrl) return;
    await navigator.clipboard.writeText(serverInfo.mcpUrl);
    toast.success("MCP URL copied", { description: serverInfo.mcpUrl });
  };

  return <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <header data-tauri-drag-region className="flex h-11 shrink-0 items-center border-b border-border bg-card/70 px-4" style={{ paddingLeft: platformName === "macos" ? 78 : undefined }}>
      <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">DB MCP</span><span>/</span><span>{pageTitle}</span></div>
      <button type="button" className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
        <CommandIcon className="size-3.5" /><span>Search commands</span><Kbd>⌘ K</Kbd>
      </button>
    </header>
    <div className="flex min-h-0 flex-1">
      <aside className={`flex shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-150 motion-reduce:transition-none ${collapsed ? "w-14" : "w-56"}`} aria-label="Main navigation">
        <div className={`flex h-14 items-center border-b border-sidebar-border ${collapsed ? "justify-center px-2" : "gap-2 px-4"}`}>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Database className="size-4" /></div>
          {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold">db-mcp</p><p className="text-[10px] text-muted-foreground">Local database gateway</p></div>}
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2 pt-4">
          {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined} className={({ isActive }) => `flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${collapsed ? "justify-center" : ""} ${isActive ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"}`}>
            <Icon className="size-4 shrink-0" /><span className={collapsed ? "sr-only" : ""}>{label}</span>
          </NavLink>)}
        </nav>
        <div className="border-t border-sidebar-border p-2">
          <button type="button" onClick={() => setCollapsed((value) => !value)} className={`flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring ${collapsed ? "justify-center" : ""}`} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : undefined}>
            {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /><span>Collapse sidebar</span></>}
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {(serverInfo?.state === "unhealthy" || serverInfo?.state === "restarting") && <div role="status" className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-5 py-2 text-xs text-foreground"><StatusDot state="warning" />{serverInfo.state === "restarting" ? "Local server is restarting…" : "Local server is responding slowly."}</div>}
        <main className="min-h-0 flex-1 overflow-y-auto"><Outlet /></main>
      </div>
    </div>
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-card/70 px-3 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2"><StatusDot state={status} /><span className="capitalize">{serverInfo?.state ?? "Connecting"}</span><span aria-hidden="true">·</span><span className="font-mono">127.0.0.1:{serverInfo?.port ?? settings?.port ?? 4080}</span><span aria-hidden="true">·</span><span>v{serverInfo?.version ?? "—"}</span></div>
      <button type="button" onClick={() => void copyMcpUrl()} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><Copy className="size-3" />Copy MCP URL</button>
    </footer>
    {paletteOpen && <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaletteOpen(false); }}>
      <Command label="Command palette" className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl" loop>
        <div className="flex items-center border-b border-border px-3"><Command.Input autoFocus placeholder="Search pages and actions…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" /><Kbd>ESC</Kbd></div>
        <Command.List className="max-h-80 overflow-y-auto p-2 text-sm"><Command.Empty className="px-3 py-8 text-center text-muted-foreground">No matching commands.</Command.Empty>
          <Command.Group heading="Navigate" className="px-1 py-1 text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2">
            {navigation.map(({ to, label, icon: Icon }) => <Command.Item key={to} onSelect={() => { navigate(to); setPaletteOpen(false); }} className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 aria-selected:bg-accent aria-selected:text-accent-foreground"><Icon className="size-4" />{label}</Command.Item>)}
          </Command.Group>
          <Command.Group heading="Actions" className="px-1 py-1 text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2">
            <Command.Item onSelect={() => { navigate("/connections/new"); setPaletteOpen(false); }} className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 aria-selected:bg-accent"><Plus className="size-4" />New connection<Kbd>⌘ N</Kbd></Command.Item>
            <Command.Item onSelect={() => { navigate("/settings"); setPaletteOpen(false); }} className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 aria-selected:bg-accent"><Settings className="size-4" />Settings<Kbd>⌘ ,</Kbd></Command.Item>
            <Command.Item onSelect={() => { void copyMcpUrl(); setPaletteOpen(false); }} className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 aria-selected:bg-accent"><Copy className="size-4" />Copy MCP URL</Command.Item>
            <Command.Item onSelect={() => { restartServer.mutate(); setPaletteOpen(false); }} className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 aria-selected:bg-accent"><Server className="size-4" />Restart server</Command.Item>
            <Command.Item onSelect={() => { toggleTheme(); setPaletteOpen(false); }} className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 aria-selected:bg-accent">{settings?.theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}Toggle theme</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>}
  </div>;
}
