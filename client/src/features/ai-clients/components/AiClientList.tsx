import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Copy, Download, FileCode2, FolderOpen, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ConfirmModal } from "@/components/brand/ConfirmModal";
import { AiClientIcon } from "@/components/brand/AiClientIcon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CopyButton } from "@/components/ui/CopyButton";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { platform } from "@/platform";
import type { AiClient, AiClientId, InstallPreview, InstallResult } from "@/platform/types";

const CLIENT_QUERY_KEY = ["ai-clients"] as const;
export function AiClientList({ compact = false, mcpUrl = "http://127.0.0.1:4080/mcp" }: { compact?: boolean; mcpUrl?: string }) {
  const queryClient = useQueryClient();
  const clients = useQuery({ queryKey: CLIENT_QUERY_KEY, queryFn: platform.listAiClients });
  const [installTarget, setInstallTarget] = useState<AiClient | null>(null);
  const [preview, setPreview] = useState<InstallPreview | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AiClient | null>(null);
  const [working, setWorking] = useState(false);
  const [showUndetected, setShowUndetected] = useState(false);

  const copyConfig = async (client: AiClient) => {
    try { await navigator.clipboard.writeText(client.snippet); toast.success(`${client.name} configuration copied`); }
    catch { toast.error("Could not copy configuration"); }
  };

  const revealConfig = async (client: AiClient) => {
    try { await platform.revealAiClientConfig(client.id); }
    catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not reveal configuration"); }
  };

  const openInstallPreview = async (client: AiClient) => {
    setInstallTarget(client);
    setWorking(true);
    try { setPreview(await platform.previewAiClientInstall(client.id)); }
    catch (error: unknown) { setInstallTarget(null); toast.error(error instanceof Error ? error.message : "Could not preview configuration"); }
    finally { setWorking(false); }
  };

  const install = async () => {
    if (!installTarget) return;
    setWorking(true);
    try {
      const result = await platform.installAiClient(installTarget.id);
      await queryClient.invalidateQueries({ queryKey: CLIENT_QUERY_KEY });
      setInstallTarget(null); setPreview(null);
      notifyInstalled(installTarget, result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not update client configuration";
      toast.error(message, { description: `${installTarget.snippet}\n\nYou can add this configuration manually.` });
    } finally { setWorking(false); }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setWorking(true);
    try {
      const result = await platform.uninstallAiClient(removeTarget.id);
      await queryClient.invalidateQueries({ queryKey: CLIENT_QUERY_KEY });
      setRemoveTarget(null);
      const removed = removeTarget;
      toast.success(`${removed.name} configuration removed`, { description: result.backupPath ? `Backup saved to ${result.backupPath}` : result.configPath, action: { label: "Undo", onClick: () => void undoRemove(removed) } });
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not remove client configuration"); }
    finally { setWorking(false); }
  };

  if (clients.isLoading) return <div className="space-y-2" role="status" aria-label="Loading AI clients">{Array.from({ length: compact ? 2 : 5 }, (_, index) => <Skeleton className="h-14 w-full" key={index} />)}</div>;
  if (clients.isError) return <EmptyState title="AI clients could not be loaded" description={clients.error instanceof Error ? clients.error.message : "Retry to check local client configuration."} action={<Button variant="outline" onClick={() => void clients.refetch()}>Retry</Button>} />;

  const detected = (clients.data ?? []).filter((client) => client.detected);
  const undetected = (clients.data ?? []).filter((client) => !client.detected);
  const claudeCommand = `claude mcp add --transport http db-mcp ${mcpUrl}`;
  const genericSnippet = JSON.stringify({ mcpServers: { "db-mcp": { url: mcpUrl } } }, null, 2);

  return <>
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {detected.length ? detected.map((client) => <AiClientRow key={client.id} client={client} mcpUrl={mcpUrl} onCopy={() => void copyConfig(client)} onReveal={() => void revealConfig(client)} onInstall={() => void openInstallPreview(client)} onRemove={() => setRemoveTarget(client)} />) : <p className="px-4 py-6 text-center text-ui-sm text-muted-foreground">No supported AI clients were detected. You can still add the MCP URL to any client.</p>}
      {!compact && undetected.length > 0 && <>
        <button type="button" className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-ui-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-expanded={showUndetected} onClick={() => setShowUndetected((value) => !value)}>{showUndetected ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}Not detected on this computer <span className="text-ui-xs">({undetected.length})</span></button>
        {showUndetected && undetected.map((client) => <AiClientRow key={client.id} client={client} mcpUrl={mcpUrl} onCopy={() => void copyConfig(client)} onReveal={() => void revealConfig(client)} onInstall={() => void openInstallPreview(client)} onRemove={() => setRemoveTarget(client)} />)}
      </>}
    </div>
    {compact && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"><div className="min-w-0"><p className="text-ui-xs font-medium text-muted-foreground">MCP URL</p><code className="block truncate font-mono text-ui-xs">{mcpUrl}</code></div><CopyButton value={mcpUrl} label="Copy URL" /></div>}
    {!compact && <section className="mt-7" aria-labelledby="other-clients-title"><div className="mb-3"><h2 id="other-clients-title" className="text-ui font-semibold">Other clients</h2><p className="mt-1 text-ui-sm text-muted-foreground">Add this MCP server to any app that supports remote HTTP servers.</p></div><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.6fr)]"><div className="min-w-0 rounded-lg border border-border bg-card p-3"><div className="mb-2 flex items-center justify-between"><span className="text-ui-xs font-medium text-muted-foreground">Generic JSON</span><CopyButton value={genericSnippet} label="Copy JSON" /></div><CodeBlock value={genericSnippet} /></div><p className="self-start rounded-lg border border-border bg-muted/40 p-3 text-ui-sm text-muted-foreground">Paste the MCP URL from the header, or this JSON, into your client's MCP server settings, then restart that client.</p></div></section>}

    <Dialog open={Boolean(installTarget)} onOpenChange={(open) => { if (!open && !working) { setInstallTarget(null); setPreview(null); } }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Configure {installTarget?.name}</DialogTitle><DialogDescription>Review the exact change before it is saved. A backup is saved next to the file.</DialogDescription></DialogHeader>
        {working && !preview ? <div className="flex flex-col gap-2" role="status" aria-label="Preparing configuration preview"><Skeleton className="h-7 w-full" /><Skeleton className="h-48 w-full" /></div> : preview && <div className="flex flex-col gap-3"><p className="truncate font-mono text-ui-xs text-muted-foreground" title={preview.configPath}>{preview.configPath}</p><div className="hidden min-h-0 gap-3 md:grid md:grid-cols-2"><ConfigPreview title="Before" value={preview.before || "(file does not exist yet)"} tone="removed" /><ConfigPreview title="After" value={preview.after || installTarget?.snippet || "(empty config preview)"} tone="added" /></div><UnifiedConfigPreview before={preview.before} after={preview.after || installTarget?.snippet || ""} /><div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-ui-sm text-muted-foreground"><span className="font-medium text-foreground">What will happen</span><span>db-mcp will be added to this client’s local MCP configuration.</span><span>A backup is saved next to the file before it is changed.</span></div></div>}
        <DialogFooter><Button variant="outline" disabled={working} onClick={() => { setInstallTarget(null); setPreview(null); }}>Cancel</Button><Button disabled={working || !preview} onClick={() => void install()}><Download data-icon="inline-start" />Confirm and add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmModal isOpen={Boolean(removeTarget)} title="Remove db-mcp configuration?" description={`This removes only the db-mcp entry from ${removeTarget?.name}'s local config.`} confirmLabel="Remove configuration" isLoading={working} onConfirm={() => void remove()} onClose={() => setRemoveTarget(null)} />
  </>;

  function notifyInstalled(client: AiClient, result: InstallResult) {
    toast.success(`${client.name} configured`, { description: result.backupPath ? `Backup saved to ${result.backupPath}` : result.configPath, action: { label: "Undo", onClick: () => void undoInstall(client.id) } });
  }

  async function undoRemove(client: AiClient) {
    try { await platform.installAiClient(client.id); await queryClient.invalidateQueries({ queryKey: CLIENT_QUERY_KEY }); toast.success(`${client.name} configuration restored`); }
    catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not restore configuration"); }
  }

  async function undoInstall(id: AiClientId) {
    try { const result = await platform.uninstallAiClient(id); await queryClient.invalidateQueries({ queryKey: CLIENT_QUERY_KEY }); toast.success("Configuration restored", { description: result.backupPath ? `Backup saved to ${result.backupPath}` : result.configPath }); }
    catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not undo configuration"); }
  }
}

function AiClientRow({ client, mcpUrl, onCopy, onReveal, onInstall, onRemove }: { client: AiClient; mcpUrl: string; onCopy: () => void; onReveal: () => void; onInstall: () => void; onRemove: () => void }) {
  const state = client.configured ? "Connected" : client.detected ? "Detected" : "Not installed";
  const command = `claude mcp add --transport http db-mcp ${mcpUrl}`;
  const copyPath = () => { if (client.configPath) void navigator.clipboard.writeText(client.configPath).then(() => toast.success("Config path copied")).catch(() => toast.error("Could not copy path")); };
  return <article className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5 last:border-b-0">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface"><AiClientIcon id={client.id} name={client.name} /></span>
    <div className="min-w-[130px] flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-ui-sm font-medium">{client.name}</h2><Badge variant="outline" className={client.configured ? "border-success/30 bg-success-subtle text-success" : "text-muted-foreground"}>{state}</Badge></div><p className="mt-0.5 max-w-[360px] truncate font-mono text-ui-xs text-muted-foreground" title={client.configPath ?? undefined}>{client.configPath ?? "No config file found"}</p></div>
    <div className="ml-auto flex items-center gap-1">
      {client.id === "claude-code" ? <CopyButton value={command} label="Copy command" /> : client.autoInstall && client.detected && !client.configured && <Button size="sm" onClick={onInstall}><Download data-icon="inline-start" />Add db-mcp</Button>}
      <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`${client.name} actions`}><MoreHorizontal /></Button>} /><DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onCopy}><Copy />Copy config</DropdownMenuItem>
        {client.configPath && <DropdownMenuItem onClick={copyPath}><Copy />Copy path</DropdownMenuItem>}
        <DropdownMenuItem onClick={onReveal}><FolderOpen />Reveal</DropdownMenuItem>
        {client.configured && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={onRemove}><Trash2 />Remove</DropdownMenuItem></>}
      </DropdownMenuContent></DropdownMenu>
    </div>
  </article>;
}

function ConfigPreview({ title, value, tone }: { title: string; value: string; tone: "added" | "removed" }) {
  const lines = value.split("\n");
  return <div className="min-w-0 overflow-hidden rounded-md border border-border"><div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-ui-xs font-medium"><FileCode2 className="size-3" />{title}</div><pre className="max-h-72 min-h-40 overflow-auto bg-background p-2 font-mono text-ui-xs leading-5">{lines.map((line, index) => <span key={`${index}-${line}`} className={`block whitespace-pre-wrap break-all px-1 ${tone === "added" ? "bg-success-subtle text-success" : "bg-danger-subtle text-destructive"}`}><span className="mr-2 select-none opacity-70">{tone === "added" ? "+" : "−"}</span>{line || " "}</span>)}</pre></div>;
}

function UnifiedConfigPreview({ before, after }: { before: string; after: string }) {
  return <div className="overflow-hidden rounded-md border border-border md:hidden"><div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-ui-xs font-medium"><FileCode2 className="size-3" />Configuration changes</div><pre className="max-h-64 overflow-auto bg-background p-2 font-mono text-ui-xs leading-5">{(before ? before.split("\n").map((line) => ({ line, sign: "−", style: "bg-danger-subtle text-destructive" })) : []).concat(after.split("\n").map((line) => ({ line, sign: "+", style: "bg-success-subtle text-success" }))).map((entry, index) => <span key={`${index}-${entry.sign}-${entry.line}`} className={`block whitespace-pre-wrap break-all px-1 ${entry.style}`}><span className="mr-2 select-none opacity-70">{entry.sign}</span>{entry.line || " "}</span>)}</pre></div>;
}
