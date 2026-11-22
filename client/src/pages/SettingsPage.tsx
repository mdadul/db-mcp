import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderOpen, PanelTop, Power, RotateCw, Server, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/Switch";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatusDot } from "@/components/ui/StatusDot";
import { Skeleton } from "@/components/ui/Skeleton";
import { SettingsGroup } from "@/components/ui/SettingsGroup";
import { SettingRow } from "@/components/ui/SettingRow";
import { NumberInput } from "@/components/ui/NumberInput";
import { RadioCards } from "@/components/ui/RadioCards";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { platform } from "@/platform";
import { useRestartServer, useServerInfo, useSettings, useUpdateSettings } from "@/platform/hooks";
import type { AppSettings } from "@/platform/types";
import { AppearanceSettings } from "@/theme/AppearanceSettings";

const DEFAULT_PORT = 4080;
type CloseBehavior = "quit" | "tray" | "background";
export function SettingsPage() {
  const { data: settings } = useSettings();
  const queryClient = useQueryClient();
  const { data: serverInfo } = useServerInfo();
  const updateSettings = useUpdateSettings();
  const restartServer = useRestartServer();
  const appInfo = useQuery({ queryKey: ["platform", "app-info"], queryFn: platform.getAppInfo });
  const [portValue, setPortValue] = useState<string | null>(null);
  const [portError, setPortError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [portConfirm, setPortConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const logs = useQuery({ queryKey: ["platform", "server-logs"], queryFn: () => platform.readServerLogs(200) });
  const visiblePort = portValue ?? String(settings?.port ?? DEFAULT_PORT);
  const portNumber = Number(visiblePort);
  const validPort = /^\d+$/.test(visiblePort) && Number.isInteger(portNumber) && portNumber >= 1024 && portNumber <= 65535;
  const portChanged = portNumber !== (settings?.port ?? DEFAULT_PORT);
  const update = (patch: Partial<AppSettings>) => updateSettings.mutate(patch, { onError: (error) => toast.error(error.message || "Could not save setting") });

  const savePort = async () => {
    if (!validPort) { setPortError("Use a whole number from 1024 to 65535"); return; }
    try {
      await updateSettings.mutateAsync({ port: portNumber });
      setPortValue(null);
      setPortError("");
      toast.success("Port saved", { description: "The server restarted with the new port. Update your AI client URLs." });
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not save server port"); }
  };

  const restart = async () => {
    try { await restartServer.mutateAsync(); toast.success("Server restarted"); }
    catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not restart server"); }
    finally { setRestartConfirm(false); }
  };

  const resetData = async () => {
    setResetting(true);
    try {
      await platform.resetAllData();
      await queryClient.invalidateQueries();
      setResetOpen(false);
      toast.success("Local data reset");
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not reset local data"); }
    finally { setResetting(false); }
  };

  const logsText = logs.data?.slice(-200).join("\n") ?? "";
  const about = [
    ["App version", appInfo.data?.version ?? "—"],
    ["Backend version", serverInfo?.version ?? "—"],
    ["Platform", appInfo.data?.platform ?? "—"],
    ["Data location", "Stored in this user's application support folder"],
  ] as const;

  return <div className="settings-content min-h-full"><div className="settings-page">
    <PageHeader title="Settings" description="Preferences for this app and its local database server." />

    <Section title="General" description="Startup and close behavior.">
      <SettingsGroup>
        <SettingRow title="Launch at login" description="Start DB MCP when you sign in to this computer." control={<Switch checked={settings?.launchAtLogin ?? false} disabled={!settings || updateSettings.isPending} onCheckedChange={(checked) => update({ launchAtLogin: checked })} aria-label="Launch at login" />} />
        <SettingRow title="Start hidden" description={settings?.launchAtLogin ? "Open in the menu bar or system tray when launched at login." : "Turn on Launch at login to use this option."} disabled={!settings?.launchAtLogin} control={<Switch checked={settings?.startHidden ?? true} disabled={!settings?.launchAtLogin || updateSettings.isPending} onCheckedChange={(checked) => update({ startHidden: checked })} aria-label="Start hidden" />} />
        <CloseBehaviorSetting />
      </SettingsGroup>
    </Section>

    <Section title="Appearance" description="Choose a theme, color mode, and interface density.">
      <AppearanceSettings />
    </Section>

    <Section title="Server" description="The database gateway listens only on this computer.">
      <SettingsGroup>
        <SettingRow title="Server status" description="Local server health and current endpoint." control={<span className="inline-flex items-center gap-2 text-ui-sm capitalize"><StatusDot state={serverInfo?.state === "healthy" ? "healthy" : serverInfo?.state === "unhealthy" || serverInfo?.state === "restarting" ? "warning" : "neutral"} />{serverInfo?.state ?? "Loading"} · 127.0.0.1:{serverInfo?.port ?? settings?.port ?? DEFAULT_PORT}</span>} />
        <SettingRow title="Port" description="AI clients use this port in their MCP URL." control={<div className="flex min-w-0 items-center gap-2"><NumberInput aria-label="Server port" value={visiblePort} min={1024} max={65535} disabled={!settings} onChange={(value) => { setPortValue(value); setPortError(""); }} className="w-36" /><Button onClick={() => { if (!validPort) setPortError("Use a whole number from 1024 to 65535"); else setPortConfirm(true); }} disabled={!portChanged || updateSettings.isPending}>Save</Button></div>} />
        {portError && <p role="alert" className="border-t border-border px-3.5 py-2 text-ui-sm text-danger">{portError}</p>}
        <SettingRow title="Restart server" description="Restart the local server without changing your settings." control={<Button variant="outline" onClick={() => setRestartConfirm(true)} disabled={restartServer.isPending}><RotateCw data-icon="inline-start" />Restart</Button>} />
        <div className="border-t border-border p-3.5"><div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-ui font-medium">Server logs</p><p className="mt-0.5 text-ui-sm text-muted-foreground">Most recent 200 lines.</p></div><div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => void logs.refetch()}>Refresh</Button><Button variant="outline" size="sm" onClick={() => void platform.openLogsDir().catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not open logs folder"))}><FolderOpen data-icon="inline-start" />Open folder</Button></div></div>{logs.isLoading ? <div className="flex flex-col gap-2 py-2" role="status" aria-label="Loading logs"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /></div> : logs.isError ? <p role="alert" className="text-ui-sm text-danger">{logs.error instanceof Error ? logs.error.message : "Logs could not be loaded"}</p> : <CodeBlock value={logsText || "No server logs yet."} />}</div>
      </SettingsGroup>
    </Section>

    <Section title="Data & privacy" description="Manage the data DB MCP stores on this computer.">
      <SettingsGroup><SettingRow title="Reset all data" description="Deletes saved database connections and credentials, resets setup, and restarts the local server." control={<Button variant="destructive" onClick={() => setResetOpen(true)}><ShieldAlert data-icon="inline-start" />Reset data</Button>} /></SettingsGroup>
    </Section>

    <Section title="About" description="Version and runtime information for this installation.">
      <SettingsGroup>{about.map(([label, value]) => <SettingRow key={label} title={label} control={<span className="max-w-[360px] truncate text-right text-ui-sm text-muted-foreground" title={value}>{value}</span>} />)}</SettingsGroup>
    </Section>
  </div>
  <ConfirmDialog open={restartConfirm} onOpenChange={setRestartConfirm} title="Restart the local server?" description="Active AI client requests may be interrupted briefly while the server restarts." confirmLabel="Restart server" pending={restartServer.isPending} onConfirm={() => void restart()} />
  <ConfirmDialog open={portConfirm} onOpenChange={setPortConfirm} title="Change the server port?" description={`The server will restart on port ${portNumber}. Update the MCP URL in each AI client that uses DB MCP.`} confirmLabel="Save and restart" pending={updateSettings.isPending} onConfirm={() => { setPortConfirm(false); void savePort(); }} />
  <ConfirmDialog open={resetOpen} onOpenChange={setResetOpen} title="Reset all local data?" description="This permanently removes saved database connections and credentials, then returns DB MCP to first-run setup." confirmLabel="Reset everything" confirmationText="reset" pending={resetting} onConfirm={() => void resetData()} />
  </div>;
}

function CloseBehaviorSetting() {
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: status, refetch } = useQuery({ queryKey: ["platform", "background-server"], queryFn: platform.getBackgroundServer, refetchInterval: 3000 });
  const [pending, setPending] = useState(false);
  const behavior: CloseBehavior = settings?.backgroundServer ? "background" : settings?.closeToTray ? "tray" : "quit";
  const locationError = status?.error?.includes("Applications") === true;
  const choose = async (value: CloseBehavior) => {
    if (!settings || pending || value === behavior) return;
    if (value === "background" && locationError) { toast.error(status?.error ?? "Background server is unavailable from this location"); return; }
    setPending(true);
    try {
      if (value === "background") {
        await platform.setBackgroundServer(true);
        if (settings.closeToTray) await updateSettings.mutateAsync({ closeToTray: false });
        toast.success("Background server started");
      } else {
        const wasBackground = settings.backgroundServer;
        if (wasBackground) await platform.setBackgroundServer(false);
        const closeToTray = value === "tray";
        if (settings.closeToTray !== closeToTray) await updateSettings.mutateAsync({ closeToTray });
        if (wasBackground) toast.success("Background server stopped");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform", "background-server"] }),
        queryClient.invalidateQueries({ queryKey: ["platform", "settings"] }),
        queryClient.invalidateQueries({ queryKey: ["platform", "server-info"] }),
      ]);
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not update close behavior"); }
    finally { setPending(false); }
  };
  const action = async (restart: boolean) => {
    setPending(true);
    try {
      if (restart) await platform.restartBackgroundServer(); else await platform.stopBackgroundServer();
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ["platform", "settings"] }), queryClient.invalidateQueries({ queryKey: ["platform", "server-info"] })]);
      toast.success(restart ? "Background server restarted" : "Background server stopped");
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not update background server"); }
    finally { setPending(false); }
  };
  return <>
    <div className="settings-row flex flex-col gap-3 px-3.5 py-3.5">
      <p className="text-ui font-medium">When you close the window</p>
      <div className={pending || !settings ? "pointer-events-none opacity-60" : ""}>
        <RadioCards value={behavior} ariaLabel="When you close the window" onChange={(value) => void choose(value)} options={[
          { value: "quit", title: "Quit DB MCP", description: "The app and its local server stop when the window closes.", icon: Power },
          { value: "tray", title: "Keep in the menu bar", description: "Hide the window and keep DB MCP running in the menu bar.", icon: PanelTop },
          { value: "background", title: "Keep only the MCP server running", description: "AI clients can keep using your databases after you quit. Starts when you log in.", icon: Server },
        ]} />
      </div>
    </div>
    {locationError && <p className="border-t border-border px-3.5 py-2 text-ui-sm text-muted-foreground">{status?.error}</p>}
    <div className="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2.5"><p className="text-ui-sm text-muted-foreground">{status?.running ? `Running in background · pid ${status.pid} · port ${status.port}` : status?.error ?? (status?.enabled ? "Starting background server…" : "Stopped")}</p>{status?.enabled && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => void action(false)}>Stop</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => void action(true)}><RotateCw data-icon="inline-start" />Restart</Button></div>}</div>
  </>;
}
