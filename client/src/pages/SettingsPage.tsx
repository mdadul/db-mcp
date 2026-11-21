import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Copy, FolderOpen, RotateCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/Switch";
import { PageHeader, Section, Skeleton } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { platform } from "@/platform";
import { useRestartServer, useServerInfo, useSettings, useUpdateSettings } from "@/platform/hooks";

const DEFAULT_PORT = 4080;

export function SettingsPage() {
  const { data: settings } = useSettings();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: serverInfo } = useServerInfo();
  const updateSettings = useUpdateSettings();
  const restartServer = useRestartServer();
  const appInfo = useQuery({ queryKey: ["platform", "app-info"], queryFn: platform.getAppInfo });
  const [portValue, setPortValue] = useState<string | null>(null);
  const [portError, setPortError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [resetting, setResetting] = useState(false);
  const logs = useQuery({ queryKey: ["platform", "server-logs"], queryFn: () => platform.readServerLogs(200) });
  const visiblePort = portValue ?? String(settings?.port ?? DEFAULT_PORT);
  const portNumber = Number(visiblePort);
  const portIsIntegerInput = /^\d+$/.test(visiblePort);
  const portIsValid = portIsIntegerInput && Number.isInteger(portNumber) && portNumber >= 1024 && portNumber <= 65535;
  const portChanged = portNumber !== (settings?.port ?? DEFAULT_PORT);
  const generalSettings = [
    { key: "launchAtLogin", title: "Launch at login", description: "Start db-mcp when you sign in to this computer.", checked: settings?.launchAtLogin ?? false },
    { key: "startHidden", title: "Start hidden", description: "Open in the menu bar or system tray when launched at login.", checked: settings?.startHidden ?? true },
    { key: "closeToTray", title: "Close to tray", description: "Keep the local server running when the window is closed.", checked: settings?.closeToTray ?? true },
  ] as const;

  const savePort = async () => {
    if (!visiblePort.trim() || !portIsValid) { setPortError("Enter a whole number between 1024 and 65535."); return; }
    setPortError("");
    try {
      await updateSettings.mutateAsync({ port: portNumber });
      setPortValue(null);
      toast.success("Server port updated", { description: "AI client configurations must use the new MCP URL." });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not update server port");
    }
  };

  const toggleSetting = (key: "launchAtLogin" | "startHidden" | "closeToTray", checked: boolean) => {
    updateSettings.mutate({ [key]: checked });
  };

  const copyLogs = async () => {
    try { await navigator.clipboard.writeText((logs.data ?? []).slice(-200).join("\n")); toast.success("Server logs copied"); }
    catch { toast.error("Could not copy server logs"); }
  };

  const resetData = async () => {
    if (confirmation !== "reset") return;
    setResetting(true);
    try {
      await platform.resetAllData();
      setResetOpen(false);
      setConfirmation("");
      await queryClient.invalidateQueries();
      navigate("/onboarding", { replace: true });
      toast.success("Local data reset");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not reset local data");
    } finally { setResetting(false); }
  };

  return <div className="mx-auto w-full max-w-5xl px-6 py-7">
    <PageHeader title="Settings" description="Manage the local server, app preferences, and local data." />
    <Section title="General" description="Choose how db-mcp starts and behaves when you close its window.">
      <div className="max-w-2xl divide-y divide-border rounded-lg border border-border bg-card">{generalSettings.map((item) => <label key={item.key} className="flex cursor-pointer items-center justify-between gap-5 p-4"><span><span className="block text-xs font-medium">{item.title}</span><span className="mt-1 block text-[11px] text-muted-foreground">{item.description}</span></span><Switch checked={item.checked} disabled={!settings || updateSettings.isPending} onCheckedChange={(checked) => toggleSetting(item.key, checked)} aria-label={item.title} /></label>)}</div>
    </Section>
    <Section title="Server" description="The backend listens only on this computer.">
      <div className="max-w-2xl rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3"><label className="min-w-52 flex-1 text-xs font-medium">Port<Input type="number" min={1024} max={65535} value={visiblePort} onChange={(event) => { setPortValue(event.target.value); setPortError(""); }} aria-invalid={Boolean(portError)} className="mt-1.5 font-mono" /></label><Button onClick={() => void savePort()} disabled={!portChanged || updateSettings.isPending}>Save port</Button><Button variant="outline" onClick={() => void restartServer.mutateAsync().then(() => toast.success("Server restarted")).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not restart server"))} disabled={restartServer.isPending}><RotateCw data-icon="inline-start" />Restart server</Button></div>
        {portError && <p role="alert" className="mt-2 text-xs text-destructive">{portError}</p>}
        {portChanged && portIsValid && <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-muted-foreground"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />Changing the port changes your MCP URL. Update AI-client configurations to use <code className="font-mono text-foreground">http://127.0.0.1:{portNumber}/mcp</code>.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground"><span>Server status: <strong className="capitalize text-foreground">{serverInfo?.state ?? "Loading"}</strong></span><span>Port: <code className="font-mono text-foreground">{serverInfo?.port ?? settings?.port ?? DEFAULT_PORT}</code></span><span>Backend v{serverInfo?.version ?? "—"}</span></div>
      </div>
      <div className="mt-4 max-w-2xl overflow-hidden rounded-lg border border-border bg-card"><div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><div><h3 className="text-xs font-medium">Recent server logs</h3><p className="mt-0.5 text-[10px] text-muted-foreground">Last 200 lines</p></div><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => void logs.refetch()}>Refresh</Button><Button variant="ghost" size="sm" onClick={() => void copyLogs()} disabled={!logs.data?.length}><Copy data-icon="inline-start" />Copy</Button><Button variant="ghost" size="sm" onClick={() => void platform.openLogsDir().catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not open logs folder"))}><FolderOpen data-icon="inline-start" />Open folder</Button></div></div>{logs.isLoading ? <div className="flex flex-col gap-2 p-4" role="status" aria-label="Loading logs"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-3/5" /></div> : logs.isError ? <p role="alert" className="p-4 text-xs text-destructive">{logs.error instanceof Error ? logs.error.message : "Logs could not be loaded."}</p> : <pre className="max-h-60 overflow-auto p-4 font-mono text-[10px] leading-5 text-muted-foreground">{logs.data?.length ? logs.data.slice(-200).join("\n") : "No server logs yet."}</pre>}</div>
    </Section>
    <Section title="Appearance" description="Choose how db-mcp looks on this device.">
      <div role="group" aria-label="Appearance theme" className="inline-flex rounded-lg border border-border bg-card p-1">{(["system", "light", "dark"] as const).map((theme) => <button key={theme} type="button" aria-pressed={settings?.theme === theme} onClick={() => updateSettings.mutate({ theme })} className={`rounded-md px-3 py-1.5 text-xs capitalize focus-visible:outline-2 focus-visible:outline-ring ${settings?.theme === theme ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{theme}</button>)}</div>
    </Section>
    <Section title="About" description="Version and runtime information.">
      <div className="grid max-w-2xl gap-3 sm:grid-cols-3">{[["App version", appInfo.data?.version ?? "—"], ["Backend version", serverInfo?.version ?? "—"], ["Platform", appInfo.data?.platform ?? "—"]].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-card p-4"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium capitalize">{value}</p></div>)}</div>
    </Section>
    <Section title="Danger zone" description="These actions permanently remove local db-mcp data.">
      <div className="flex max-w-2xl items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4"><div><h3 className="flex items-center gap-2 text-xs font-semibold"><ShieldAlert className="size-4 text-destructive" />Reset all data</h3><p className="mt-1 text-[11px] text-muted-foreground">Deletes saved database connections and resets local setup.</p></div><Button variant="destructive" size="sm" onClick={() => { setConfirmation(""); setResetOpen(true); }}>Reset data</Button></div>
    </Section>
    <Dialog open={resetOpen} onOpenChange={(open) => { if (!open && !resetting) setResetOpen(false); }}><DialogContent><DialogHeader><DialogTitle>Reset all local data?</DialogTitle><DialogDescription>This permanently removes saved database connections and resets db-mcp setup. Type <code className="font-mono">reset</code> to continue.</DialogDescription></DialogHeader><Input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-label="Type reset to confirm" className="font-mono" /><DialogFooter><Button variant="outline" disabled={resetting} onClick={() => setResetOpen(false)}>Cancel</Button><Button variant="destructive" disabled={confirmation !== "reset" || resetting} onClick={() => void resetData()}>{resetting ? "Resetting…" : "Reset everything"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
