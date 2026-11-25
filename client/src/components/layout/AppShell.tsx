import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  Activity,
  Command as CommandIcon,
  Copy,
  Database,
  EllipsisVertical,
  FolderOpen,
  Keyboard,
  PanelLeft,
  Plus,
  RotateCw,
  Settings,
  Users,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/Kbd";
import { ShortcutSheet } from "@/components/ui/ShortcutSheet";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatShortcut, getShortcut, shortcutOsForPlatform } from "@/lib/shortcuts";
import { platform } from "@/platform";
import { useRestartServer, useServerInfo, useSettings } from "@/platform/hooks";
import { installThemeApplication, registerCustomThemes } from "@/theme/runtime";
import { themeSchema } from "@/theme/schema";
import { builtInThemeIds } from "@/theme/themes";

const RAIL_EXPANDED_KEY = "dbmcp.railExpanded";

const navigation = [
  { to: "/connections", label: "Connections", icon: Database, shortcut: "gotoConnections" },
  { to: "/ai-clients", label: "AI Clients", icon: Users, shortcut: "gotoAiClients" },
  { to: "/activity", label: "Activity", icon: Activity, shortcut: "gotoActivity" },
  { to: "/settings", label: "Settings", icon: Settings, shortcut: "gotoSettings" },
] as const;

/** Fixed desktop window chrome, navigation rail, status controls, and command palette. */
export function AppShell() {
  const [railExpanded, setRailExpanded] = useState(
    () => localStorage.getItem(RAIL_EXPANDED_KEY) === "true",
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [platformName, setPlatformName] = useState<string>();
  const { data: serverInfo } = useServerInfo();
  const { data: settings } = useSettings();
  const { data: customThemes = [], isSuccess: customThemesLoaded } = useQuery({
    queryKey: ["platform", "custom-themes"],
    queryFn: async () =>
      (await platform.listCustomThemes()).flatMap((json) => {
        try {
          const parsed: unknown = JSON.parse(json);
          const result = themeSchema.safeParse(parsed);
          return result.success ? [result.data] : [];
        } catch {
          return [];
        }
      }),
  });
  const restartServer = useRestartServer();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const isMac = platformName === "macos";
  const os = shortcutOsForPlatform(
    platformName === "macos" || platformName === "windows" || platformName === "linux"
      ? platformName
      : undefined,
  );
  const onConnections = location.pathname.startsWith("/connections");

  useEffect(() => {
    void platform.getAppInfo().then((info) => setPlatformName(info.platform));
  }, []);
  useEffect(() => {
    localStorage.setItem(RAIL_EXPANDED_KEY, String(railExpanded));
  }, [railExpanded]);

  useEffect(() => {
    registerCustomThemes(customThemes);
    if (!settings || (!builtInThemeIds.has(settings.themeId) && !customThemesLoaded))
      return undefined;
    return installThemeApplication({ ...settings, mode: settings.theme, customThemes });
  }, [settings, customThemes, customThemesLoaded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPaletteOpen(false);
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;
      if (event.key === "\\") {
        event.preventDefault();
        setRailExpanded((value) => !value);
        return;
      }
      if (event.key === ",") {
        event.preventDefault();
        navigate("/settings");
        return;
      }
      if (/^[1-5]$/.test(event.key)) {
        event.preventDefault();
        navigate(navigation[Number(event.key) - 1].to);
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setShortcutsOpen(false);
        setPaletteOpen(true);
        return;
      }
      if (key === "/") {
        event.preventDefault();
        setPaletteOpen(false);
        setShortcutsOpen(true);
        return;
      }
      if (key === "n") {
        event.preventDefault();
        navigate("/connections/new");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  useEffect(() => {
    const preventChromeContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        target.closest(
          "input, textarea, select, [contenteditable='true'], pre, code, [data-selectable='true']",
        )
      )
        return;
      event.preventDefault();
    };
    window.addEventListener("contextmenu", preventChromeContextMenu);
    return () => window.removeEventListener("contextmenu", preventChromeContextMenu);
  }, []);

  const status =
    serverInfo?.state === "healthy"
      ? "healthy"
      : serverInfo?.state === "unhealthy" || serverInfo?.state === "restarting"
        ? "warning"
        : "error";
  const port = serverInfo?.port ?? settings?.port ?? 4080;
  const serverState =
    serverInfo?.mode === "background"
      ? "Background"
      : serverInfo?.state === "healthy"
        ? "Running"
        : (serverInfo?.state ?? "Connecting");
  const serverLabel = `${serverState} · 127.0.0.1:${port}`;
  const serverTitle = `Server ${serverState} at 127.0.0.1:${port}`;
  const paletteShortcut = formatShortcut(getShortcut("commandPalette").keys, os);
  const toggleRailShortcut = formatShortcut(getShortcut("toggleNavigation").keys, os);
  const shortcutsShortcut = formatShortcut(getShortcut("shortcutSheet").keys, os);
  const copyMcpUrl = async () => {
    if (!serverInfo?.mcpUrl) return;
    try {
      await navigator.clipboard.writeText(serverInfo.mcpUrl);
      toast.success("MCP URL copied", { description: serverInfo.mcpUrl });
    } catch {
      toast.error("Could not copy MCP URL");
    }
  };

  return (
    <div className="app-window flex-row bg-background text-foreground">
      <aside
        className={`app-sidebar flex shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-150 ease-out ${railExpanded ? "w-[220px]" : "w-14"}`}
        aria-label="Main navigation"
      >
        <div
          data-tauri-drag-region
          className="h-11 shrink-0 border-b border-sidebar-border"
          aria-hidden="true"
        />
        <div
          className={`flex min-h-(--control-h-lg) shrink-0 items-center ${railExpanded ? "gap-2.5 px-3" : "justify-center px-2"}`}
        >
          <BrandMark title={railExpanded ? undefined : "DB MCP"} decorative={railExpanded} />
          {railExpanded && (
            <div className="min-w-0">
              <p className="truncate text-ui font-semibold">DB MCP</p>
              <p className="text-ui-xs leading-tight text-muted-foreground">
                Safe database access for AI tools
              </p>
            </div>
          )}
        </div>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 pt-3">
          {railExpanded && (
            <p className="px-2 pb-1 text-ui-xs font-semibold uppercase tracking-wider text-text-subtle">
              Workspace
            </p>
          )}
          {navigation.map(({ to, label, icon: Icon, shortcut }) => {
            const link = (
              <NavLink
                to={to}
                aria-label={label}
                className={({ isActive }) =>
                  `flex items-center rounded-md text-ui transition-colors focus-visible:outline-2 focus-visible:outline-ring ${railExpanded ? "min-h-9 gap-2.5 px-2" : "mx-auto size-10 justify-center"} ${isActive ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"}`
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {railExpanded && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <Kbd className="ml-auto">{formatShortcut(getShortcut(shortcut).keys, os)}</Kbd>
                  </>
                )}
              </NavLink>
            );
            return railExpanded ? (
              <Fragment key={to}>{link}</Fragment>
            ) : (
              <Tooltip
                key={to}
                content={`${label} · ${formatShortcut(getShortcut(shortcut).keys, os)}`}
                side="right"
              >
                {link}
              </Tooltip>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  title={serverTitle}
                  aria-label={`${serverTitle}. Server and navigation options`}
                  className={`rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring ${railExpanded ? "flex min-h-9 w-full items-center gap-2 px-2 text-ui-xs" : "mx-auto flex size-10 items-center justify-center"}`}
                >
                  <StatusDot state={status} />
                  {railExpanded && (
                    <>
                      <span className="min-w-0 flex-1 truncate text-left">{serverLabel}</span>
                      <EllipsisVertical className="size-3.5 shrink-0" />
                    </>
                  )}
                </button>
              }
            />
            <DropdownMenuContent side="right" align="end" className="w-auto min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{`Local server · ${serverState}`}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => restartServer.mutate()}>
                  <RotateCw className="size-3.5" />
                  Restart server
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void copyMcpUrl()}>
                  <Copy className="size-3.5" />
                  Copy MCP URL
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void platform.openLogsDir()}>
                  <FolderOpen className="size-3.5" />
                  Open logs folder
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setRailExpanded((value) => !value)}>
                <PanelLeft className="size-3.5" />
                {railExpanded ? "Hide labels" : "Show labels"}
                <Kbd className="ml-auto">{toggleRailShortcut}</Kbd>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
                <Keyboard className="size-3.5" />
                Keyboard shortcuts<Kbd className="ml-auto">{shortcutsShortcut}</Kbd>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          data-tauri-drag-region
          className={`flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 ${isMac && !railExpanded ? "pl-[76px]" : ""}`}
        >
          <div data-tauri-drag-region className="min-w-0 flex-1" aria-hidden="true" />
          {onConnections && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Refresh connections"
                title="Refresh connections"
                onClick={() => void queryClient.invalidateQueries({ queryKey: ["databases"] })}
              >
                <RotateCw />
              </Button>
              <Button size="sm" onClick={() => navigate("/connections/new")}>
                <Plus data-icon="inline-start" />
                New connection
              </Button>
            </>
          )}
          <button
            type="button"
            className="flex h-7 items-center gap-2 rounded-md border border-border bg-background px-2 text-ui-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
          >
            <CommandIcon className="size-3.5" />
            <span>Search</span>
            <Kbd>{paletteShortcut}</Kbd>
          </button>
        </header>
        {(serverInfo?.state === "unhealthy" || serverInfo?.state === "restarting") && (
          <div
            role="status"
            className="flex h-8 shrink-0 items-center gap-2 border-b border-warning/30 bg-warning-subtle px-4 text-ui-sm"
          >
            <StatusDot state="warning" />
            {serverInfo.state === "restarting"
              ? "Local server is restarting…"
              : "Local server is responding slowly."}
          </div>
        )}
        <main
          className={`app-content min-w-0 flex-1 ${onConnections ? "workbench-pane" : ""}`}
          data-layout={onConnections ? "workbench" : "standard"}
        >
          <Outlet />
        </main>
      </div>
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPaletteOpen(false);
          }}
        >
          <Command
            label="Command palette"
            className="w-full max-w-[560px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
            loop
          >
            <div className="flex items-center border-b border-border px-3">
              <Command.Input
                autoFocus
                placeholder="Search pages and actions…"
                className="h-10 flex-1 bg-transparent text-ui outline-none placeholder:text-muted-foreground"
              />
              <Kbd>ESC</Kbd>
            </div>
            <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto p-1.5 text-ui">
              <Command.Empty className="px-3 py-8 text-center text-ui-sm text-muted-foreground">
                No matching commands.
              </Command.Empty>
              <Command.Group
                heading="Navigate"
                className="px-1 py-1 text-ui-xs font-semibold uppercase tracking-wide text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2"
              >
                {navigation.map(({ to, label, icon: Icon, shortcut }) => (
                  <Command.Item
                    key={to}
                    onSelect={() => {
                      navigate(to);
                      setPaletteOpen(false);
                    }}
                    className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 aria-selected:bg-accent-subtle aria-selected:text-foreground"
                  >
                    <Icon className="size-3.5" />
                    {label}
                    <Kbd className="ml-auto">{formatShortcut(getShortcut(shortcut).keys, os)}</Kbd>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group
                heading="Actions"
                className="px-1 py-1 text-ui-xs font-semibold uppercase tracking-wide text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2"
              >
                <Command.Item
                  onSelect={() => {
                    navigate("/connections/new");
                    setPaletteOpen(false);
                  }}
                  className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 aria-selected:bg-accent-subtle"
                >
                  <Plus className="size-3.5" />
                  New connection
                  <Kbd className="ml-auto">
                    {formatShortcut(getShortcut("newConnection").keys, os)}
                  </Kbd>
                </Command.Item>
                <Command.Item
                  onSelect={() => {
                    setPaletteOpen(false);
                    setShortcutsOpen(true);
                  }}
                  className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 aria-selected:bg-accent-subtle"
                >
                  <Keyboard className="size-3.5" />
                  Keyboard shortcuts<Kbd className="ml-auto">{shortcutsShortcut}</Kbd>
                </Command.Item>
                <Command.Item
                  onSelect={() => {
                    navigate("/settings");
                    setPaletteOpen(false);
                  }}
                  className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 aria-selected:bg-accent-subtle"
                >
                  <Settings className="size-3.5" />
                  Settings
                  <Kbd className="ml-auto">{formatShortcut(getShortcut("settings").keys, os)}</Kbd>
                </Command.Item>
                <Command.Item
                  onSelect={() => {
                    void copyMcpUrl();
                    setPaletteOpen(false);
                  }}
                  className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 aria-selected:bg-accent-subtle"
                >
                  <Copy className="size-3.5" />
                  Copy MCP URL
                </Command.Item>
                <Command.Item
                  onSelect={() => {
                    restartServer.mutate();
                    setPaletteOpen(false);
                  }}
                  className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 aria-selected:bg-accent-subtle"
                >
                  <RotateCw className="size-3.5" />
                  Restart server
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      )}
      <ShortcutSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} os={os} />
    </div>
  );
}

function BrandMark({ title, decorative = false }: { title?: string; decorative?: boolean }) {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "DB MCP"}
      aria-hidden={decorative || undefined}
      title={title}
      className="block size-7 shrink-0 bg-current text-primary"
      style={{
        maskImage: "url(/brand-mark.svg)",
        WebkitMaskImage: "url(/brand-mark.svg)",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
