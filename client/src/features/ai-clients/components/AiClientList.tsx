import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, FileCode2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ConfirmModal } from "@/components/brand/ConfirmModal";
import { platform } from "@/platform";
import type { AiClient, AiClientId, InstallPreview, InstallResult } from "@/platform/types";

const CLIENT_QUERY_KEY = ["ai-clients"] as const;

export function AiClientList() {
  const queryClient = useQueryClient();
  const clients = useQuery({ queryKey: CLIENT_QUERY_KEY, queryFn: platform.listAiClients });
  const [installTarget, setInstallTarget] = useState<AiClient | null>(null);
  const [preview, setPreview] = useState<InstallPreview | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AiClient | null>(null);
  const [working, setWorking] = useState(false);

  const copyConfig = async (client: AiClient) => {
    await navigator.clipboard.writeText(client.snippet);
    toast.success(`${client.name} configuration copied`);
  };

  const openInstallPreview = async (client: AiClient) => {
    setInstallTarget(client);
    setWorking(true);
    try {
      setPreview(await platform.previewAiClientInstall(client.id));
    } catch (error: unknown) {
      setInstallTarget(null);
      toast.error(error instanceof Error ? error.message : "Could not preview configuration");
    } finally {
      setWorking(false);
    }
  };

  const install = async () => {
    if (!installTarget) return;
    setWorking(true);
    try {
      const result = await platform.installAiClient(installTarget.id);
      await queryClient.invalidateQueries({ queryKey: CLIENT_QUERY_KEY });
      setInstallTarget(null);
      setPreview(null);
      notifyInstalled(installTarget, result);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not update client configuration");
    } finally {
      setWorking(false);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setWorking(true);
    try {
      const result = await platform.uninstallAiClient(removeTarget.id);
      await queryClient.invalidateQueries({ queryKey: CLIENT_QUERY_KEY });
      setRemoveTarget(null);
      toast.success(`${removeTarget.name} configuration removed`, { description: result.backupPath ? `Backup saved to ${result.backupPath}` : result.configPath });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not remove client configuration");
    } finally {
      setWorking(false);
    }
  };

  if (clients.isLoading) return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading AI clients">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-48" key={index} />)}</div>;
  if (clients.isError) return <EmptyState title="AI clients could not be loaded" description={clients.error instanceof Error ? clients.error.message : "Retry to check local client configuration."} action={<Button variant="outline" onClick={() => void clients.refetch()}>Retry</Button>} />;

  return <>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(clients.data ?? []).map((client) => <AiClientCard key={client.id} client={client} onCopy={() => void copyConfig(client)} onInstall={() => void openInstallPreview(client)} onRemove={() => setRemoveTarget(client)} />)}</div>
    <Dialog open={Boolean(installTarget)} onOpenChange={(open) => { if (!open && !working) { setInstallTarget(null); setPreview(null); } }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Configure {installTarget?.name}</DialogTitle><DialogDescription>Review the exact local config change before applying it. A backup is created when an existing file is updated.</DialogDescription></DialogHeader>
        {working && !preview ? <div className="flex flex-col gap-2" role="status" aria-label="Preparing configuration preview"><Skeleton className="h-7 w-full" /><Skeleton className="h-48 w-full" /></div> : preview && <div className="flex flex-col gap-3"><p className="truncate font-mono text-[11px] text-muted-foreground" title={preview.configPath}>{preview.configPath}</p><div className="grid min-h-0 gap-3 md:grid-cols-2"><ConfigPreview title="Before" value={preview.before || "(file does not exist yet)"} /><ConfigPreview title="After" value={preview.after || installTarget?.snippet || "(empty config preview)"} /></div></div>}
        <DialogFooter><Button variant="outline" disabled={working} onClick={() => { setInstallTarget(null); setPreview(null); }}>Cancel</Button><Button disabled={working || !preview} onClick={() => void install()}><Download data-icon="inline-start" />Confirm and configure</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmModal isOpen={Boolean(removeTarget)} title="Remove db-mcp configuration?" description={`This removes only the db-mcp entry from ${removeTarget?.name}'s local config.`} confirmLabel="Remove configuration" isLoading={working} onConfirm={() => void remove()} onClose={() => setRemoveTarget(null)} />
  </>;

  function notifyInstalled(client: AiClient, result: InstallResult) {
    toast.success(`${client.name} configured`, {
      description: result.backupPath ? `Backup saved to ${result.backupPath}` : result.configPath,
      action: { label: "Undo", onClick: () => void undoInstall(client.id) },
    });
  }

  async function undoInstall(id: AiClientId) {
    try {
      const result = await platform.uninstallAiClient(id);
      await queryClient.invalidateQueries({ queryKey: CLIENT_QUERY_KEY });
      toast.success("Configuration restored", { description: result.backupPath ? `Backup saved to ${result.backupPath}` : result.configPath });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not undo configuration");
    }
  }
}

function AiClientCard({ client, onCopy, onInstall, onRemove }: { client: AiClient; onCopy: () => void; onInstall: () => void; onRemove: () => void }) {
  const state = client.configured ? "Connected" : client.detected ? "Detected · not configured" : "Not detected";
  const variant = client.configured ? "secondary" : "outline";
  return <article className="flex min-h-48 flex-col rounded-lg border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-sm font-semibold" aria-hidden="true">{client.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{client.name}</h2><p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={client.configPath ?? undefined}>{client.configPath ?? "No config file found"}</p></div></div><Badge variant={variant}>{state}</Badge></div>
    <div className="mt-auto flex flex-wrap gap-2 pt-5">{client.autoInstall && !client.configured && <Button size="sm" onClick={onInstall}><Download data-icon="inline-start" />Add db-mcp</Button>}{client.configured && <Button size="sm" variant="outline" onClick={onRemove}><Trash2 data-icon="inline-start" />Remove</Button>}<Button size="sm" variant="ghost" onClick={onCopy}><Copy data-icon="inline-start" />Copy config</Button></div>
  </article>;
}

function ConfigPreview({ title, value }: { title: string; value: string }) {
  return <div className="min-w-0 overflow-hidden rounded-md border border-border"><div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-medium"><FileCode2 className="size-3" />{title}</div><pre className="max-h-72 min-h-40 overflow-auto bg-background p-3 font-mono text-[10px] leading-5 text-muted-foreground">{value}</pre></div>;
}
