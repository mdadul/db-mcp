import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Bot, ChevronsLeft, ChevronsRight, Command as CommandIcon, Copy, Database, MoreHorizontal, Plus, RotateCw, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { StatusDot } from "@/components/ui/StatusDot";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { platform } from "@/platform";
import { useRestartServer, useServerInfo, useSettings } from "@/platform/hooks";
import { installThemeApplication, registerCustomThemes } from "@/theme/runtime";
import { themeSchema } from "@/theme/schema";
import { builtInThemeIds } from "@/theme/themes";

const navigation = [
  { to: "/connections", label: "Connections", icon: Database },
  { to: "/analyst", label: "Analyst", icon: Bot },
  { to: "/ai-clients", label: "AI Clients", icon: Users },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

/** Fixed desktop window chrome, navigation, status controls, and command palette. */
export function AppShell() {
  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(() => {
    const saved = localStorage.getItem("dbmcp.sidebarCollapsed");
    return saved === null ? null : saved === "true";
  });
  const [narrowWindow, setNarrowWindow] = useState(() => window.innerWidth < 1100);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [platformName, setPlatformName] = useState<string>();
  const { data: serverInfo } = useServerInfo();
  const { data: settings } = useSettings();
  const { data: customThemes = [], isSuccess: customThemesLoaded } = useQuery({
    queryKey: ["platform", "custom-themes"],
    queryFn: async () => (await platform.listCustomThemes()).flatMap((json) => {
      try {
        const parsed: unknown = JSON.parse(json);
        const result = themeSchema.safeParse(parsed);
        return result.success ? [result.data] : [];
      } catch { return []; }
    }),
  });
  const restartServer = useRestartServer();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const collapsed = manualCollapsed ?? narrowWindow;
  const isMac = platformName === "macos";
  const onConnections = location.pathname.startsWith("/connections");

  useEffect(() => { void platform.getAppInfo().then((info) => setPlatformName(info.platform)); }, []);
  useEffect(() => {
    const onResize = () => setNarrowWindow(window.innerWidth < 1100);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (manualCollapsed !== null) return;
    const preference = window.matchMedia("(max-width: 1099px)");
    const sync = () => setNarrowWindow(preference.matches);
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, [manualCollapsed]);
  useEffect(() => {
    if (manualCollapsed !== null) localStorage.setItem("dbmcp.sidebarCollapsed", String(manualCollapsed));
  }, [manualCollapsed]);

  useEffect(() => {
    registerCustomThemes(customThemes);
    if (!settings || (!builtInThemeIds.has(settings.themeId) && !customThemesLoaded)) return undefined;
    return installThemeApplication({ ...settings, mode: settings.theme, customThemes });
  }, [settings, customThemes, customThemesLoaded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen(true); }
      if (mod && event.key.toLowerCase() === "n") { event.preventDefault(); navigate("/connections/new"); }
      if (mod && event.key === ",") { event.preventDefault(); navigate("/settings"); }
      if (mod && event.key === "\\") { event.preventDefault(); setManualCollapsed((value) => !(value ?? narrowWindow)); }
      if (mod && /^[1-5]$/.test(event.key)) { event.preventDefault(); navigate(event.key === "5" ? "/analyst" : navigation[Number(event.key) - 1].to); }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, narrowWindow]);

  useEffect(() => {
    const preventChromeContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("input, textarea, select, [contenteditable='true'], pre, code, [data-selectable='true']")) return;
      event.preventDefault();
    };
    window.addEventListener("contextmenu", preventChromeContextMenu);
    return () => window.removeEventListener("contextmenu", preventChromeContextMenu);
  }, []);

  const status = serverInfo?.state === "healthy" ? "healthy" : serverInfo?.state === "unhealthy" || serverInfo?.state === "restarting" ? "warning" : "error";
  const pageTitle = useMemo(() => navigation.find((item) => location.pathname.startsWith(item.to))?.label ?? "Connections", [location.pathname]);
  const copyMcpUrl = async () => {
    if (!serverInfo?.mcpUrl) return;
    try { await navigator.clipboard.writeText(serverInfo.mcpUrl); toast.success("MCP URL copied", { description: serverInfo.mcpUrl }); }
    catch { toast.error("Could not copy MCP URL"); }
  };
  const shortcut = platformName === "macos" ? "⌘" : "Ctrl+";

  return <div className="app-window flex-row bg-background text-foreground">
    <aside className={`app-sidebar flex w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-150 ease-out ${collapsed ? "!w-[52px]" : ""}`} data-auto-collapsed={collapsed} aria-label="Main navigation">
      <div data-tauri-drag-region className="h-11 shrink-0 border-b border-sidebar-border" aria-hidden="true" />
      <div className={`flex h-10 shrink-0 items-center ${collapsed ? "justify-center px-2" : "gap-2.5 px-3"}`}>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><Database className="size-4" /></div>
        {!collapsed && <div className="min-w-0"><p className="truncate text-[13px] font-semibold">db-mcp</p><p className="truncate text-[11px] text-muted-foreground">Local database gateway</p></div>}
      </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 pt-3">
          {!collapsed && <p className="sidebar-label px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">Workspace</p>}
          {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined} className={({ isActive }) => `flex h-7 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring ${collapsed ? "justify-center px-0" : ""} ${isActive ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"}`}>
            <Icon className="size-3.5 shrink-0" /><span className={`sidebar-label min-w-0 flex-1 truncate ${collapsed ? "sr-only" : ""}`}>{label}</span>
          </NavLink>)}
        </nav>
        <div className="border-t border-sidebar-border p-2">
          <div className={`mb-1 flex min-h-8 items-center gap-2 rounded-md px-2 text-[11px] ${collapsed ? "justify-center px-0" : ""}`} title={`Server ${serverInfo?.state ?? "connecting"} at 127.0.0.1:${serverInfo?.port ?? settings?.port ?? 4080}`}><StatusDot state={status} />{!collapsed && <><span className="min-w-0 flex-1 truncate text-muted-foreground">{serverInfo?.mode === "background" ? "Background" : serverInfo?.state === "healthy" ? "Running" : serverInfo?.state ?? "Connecting"} · 127.0.0.1:{serverInfo?.port ?? settings?.port ?? 4080}</span><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Server actions"><MoreHorizontal /></Button>} /><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => restartServer.mutate()}><RotateCw className="size-3.5" />Restart server</DropdownMenuItem><DropdownMenuItem onClick={() => void copyMcpUrl()}><Copy className="size-3.5" />Copy MCP URL</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => void platform.openLogsDir()}>Open logs folder</DropdownMenuItem></DropdownMenuContent></DropdownMenu></>}</div>
          <button type="button" onClick={() => setManualCollapsed((value) => !(value ?? narrowWindow))} className={`flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring ${collapsed ? "justify-center px-0" : ""}`} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : undefined}>{collapsed ? <ChevronsRight className="size-3.5" /> : <><ChevronsLeft className="size-3.5" /><span className="sidebar-label">Collapse sidebar</span><Kbd className="ml-auto">{shortcut}\\</Kbd></>}</button>
        </div>
    </aside>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header data-tauri-drag-region className={`flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 ${isMac && collapsed ? "pl-[76px]" : ""}`}>
          <div data-tauri-drag-region className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{pageTitle}</div>
          {onConnections && <><Button variant="ghost" size="icon-sm" aria-label="Refresh connections" title="Refresh connections" onClick={() => void queryClient.invalidateQueries({ queryKey: ["databases"] })}><RotateCw /></Button><Button size="sm" onClick={() => navigate("/connections/new")}><Plus data-icon="inline-start" />New connection</Button></>}
          <button type="button" className="flex h-7 items-center gap-2 rounded-md border border-border bg-background px-2 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={() => setPaletteOpen(true)} aria-label="Open command palette"><CommandIcon className="size-3.5" /><span>Search</span><Kbd>{shortcut}K</Kbd></button>
        </header>
        {(serverInfo?.state === "unhealthy" || serverInfo?.state === "restarting") && <div role="status" className="flex h-8 shrink-0 items-center gap-2 border-b border-warning/30 bg-warning-subtle px-4 text-[12px]"><StatusDot state="warning" />{serverInfo.state === "restarting" ? "Local server is restarting…" : "Local server is responding slowly."}</div>}
        <main className={`app-content min-w-0 flex-1 ${onConnections ? "workbench-pane" : ""}`} data-layout={onConnections ? "workbench" : "standard"}><Outlet /></main>
    </div>
    {paletteOpen && <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaletteOpen(false); }}>
      <Command label="Command palette" className="w-full max-w-[560px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl" loop>
        <div className="flex items-center border-b border-border px-3"><Command.Input autoFocus placeholder="Search pages and actions…" className="h-10 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" /><Kbd>ESC</Kbd></div>
        <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto p-1.5 text-[13px]"><Command.Empty className="px-3 py-8 text-center text-[12px] text-muted-foreground">No matching commands.</Command.Empty>
          <Command.Group heading="Navigate" className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2">
            {navigation.map(({ to, label, icon: Icon }, index) => <Command.Item key={to} onSelect={() => { navigate(to); setPaletteOpen(false); }} className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 aria-selected:bg-accent-subtle aria-selected:text-foreground"><Icon className="size-3.5" />{label}<Kbd className="ml-auto">{shortcut}{index + 1}</Kbd></Command.Item>)}
          </Command.Group>
          <Command.Group heading="Actions" className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2">
            <Command.Item onSelect={() => { navigate("/connections/new"); setPaletteOpen(false); }} className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 aria-selected:bg-accent-subtle"><Plus className="size-3.5" />New connection<Kbd className="ml-auto">{shortcut}N</Kbd></Command.Item>
            <Command.Item onSelect={() => { navigate("/settings"); setPaletteOpen(false); }} className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 aria-selected:bg-accent-subtle"><Settings className="size-3.5" />Settings<Kbd className="ml-auto">{shortcut},</Kbd></Command.Item>
            <Command.Item onSelect={() => { void copyMcpUrl(); setPaletteOpen(false); }} className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 aria-selected:bg-accent-subtle"><Copy className="size-3.5" />Copy MCP URL</Command.Item>
            <Command.Item onSelect={() => { restartServer.mutate(); setPaletteOpen(false); }} className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 aria-selected:bg-accent-subtle"><ServerIcon />Restart server</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>}
  </div>;
}

function ServerIcon() { return <RotateCw className="size-3.5" />; }
