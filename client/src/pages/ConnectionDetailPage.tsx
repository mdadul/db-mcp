import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Pencil, Server } from "lucide-react";
import { toast } from "sonner";
import { databaseApi } from "@/features/databases/api/databaseApi";
import { getActivity } from "@/features/activity/api/activityApi";
import { ActivityTable } from "@/features/activity/components/ActivityTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton, PageHeader, EmptyState } from "@/components/ui/primitives";
import { useServerInfo } from "@/platform/hooks";
import { platform } from "@/platform";
import type { AiClient } from "@/platform/types";

type DetailTab = "overview" | "activity" | "connect";

function clientSnippet(client: AiClient, mcpUrl: string): string {
  if (client.id === "claude-desktop") return JSON.stringify({ mcpServers: { "db-mcp": { command: "npx", args: ["-y", "mcp-remote", mcpUrl] } } }, null, 2);
  return JSON.stringify({ mcpServers: { "db-mcp": { url: mcpUrl } } }, null, 2);
}

export function ConnectionDetailPage() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState<DetailTab>("overview");
  const connection = useQuery({ queryKey: ["databases", id], queryFn: () => databaseApi.getById(id), enabled: Boolean(id) });
  const logs = useQuery({ queryKey: ["activity", "connection", id], queryFn: () => getActivity({ limit: 50, offset: 0, databaseId: id }), enabled: Boolean(id) && tab === "activity" });
  const { data: serverInfo } = useServerInfo();
  const clients = useQuery({ queryKey: ["ai-clients"], queryFn: platform.listAiClients, enabled: tab === "connect" });

  if (connection.isLoading) return <div className="mx-auto max-w-5xl px-6 py-7" role="status" aria-label="Loading connection"><Skeleton className="mb-6 h-10 w-72" /><Skeleton className="h-72 w-full" /></div>;
  if (!connection.data) return <div className="mx-auto max-w-5xl px-6 py-7"><EmptyState title="Connection not found" description="It may have been deleted. Return to your connection list to continue." action={<Link to="/connections"><Button variant="outline">Back to connections</Button></Link>} /></div>;

  const database = connection.data;
  const createdDate = new Date(database.createdAt);
  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return <div className="mx-auto w-full max-w-5xl px-6 py-7">
    <PageHeader title={database.name} description={`${database.type} · ${database.type === "sqlite" ? database.databaseName : `${database.host}:${database.port}`}`} actions={<Link to={`/connections/${database.id}/edit`}><Button variant="outline" size="sm"><Pencil data-icon="inline-start" />Edit connection</Button></Link>} />
    <div role="tablist" aria-label="Connection details" className="mb-5 flex gap-1 border-b border-border">{(["overview", "activity", "connect"] as const).map((value) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`border-b-2 px-3 py-2 text-xs font-medium capitalize focus-visible:outline-2 focus-visible:outline-ring ${tab === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{value}</button>)}</div>
    {tab === "overview" && <section className="grid gap-3 sm:grid-cols-2" aria-label="Connection overview">
      <InfoCard label="Status"><Badge variant={database.status === "enabled" ? "secondary" : "outline"} className="capitalize">{database.status}</Badge></InfoCard>
      <InfoCard label="Database">{database.databaseName}</InfoCard>
      <InfoCard label="Host">{database.type === "sqlite" ? "Local file" : `${database.host}:${database.port}`}</InfoCard>
      <InfoCard label="Created">{createdDate.toLocaleString()}</InfoCard>
      <InfoCard label="Last test">Test history is not persisted for connection checks.</InfoCard>
      <InfoCard label="Security">Credentials are encrypted locally. Query access is read-only.</InfoCard>
      {database.environment && <InfoCard label="Environment">{database.environment}</InfoCard>}
      {database.serviceName && <InfoCard label="Service">{database.serviceName}</InfoCard>}
    </section>}
    {tab === "activity" && (logs.isLoading ? <div className="flex flex-col gap-2" role="status" aria-label="Loading connection activity">{Array.from({ length: 5 }, (_, i) => <Skeleton className="h-10 w-full" key={i} />)}</div> : logs.data?.items.length ? <ActivityTable items={logs.data.items} /> : <EmptyState title="No activity for this connection" description="Recent queries will appear here after an AI client uses this database." />)}
    {tab === "connect" && <section className="flex flex-col gap-4"><div className="rounded-lg border border-border bg-card p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium">Local MCP endpoint</p><p className="mt-1 font-mono text-xs text-muted-foreground">{serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp"}</p></div><Button variant="outline" size="sm" onClick={() => void copyText(serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp", "MCP URL")}><Copy data-icon="inline-start" />Copy URL</Button></div><p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Server className="size-3" />The MCP endpoint only accepts local connections from this computer.</p></div>
      {(clients.data ?? []).map((client) => <div key={client.id} className="rounded-lg border border-border bg-card p-4"><div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-semibold">{client.name.slice(0, 1)}</span><div><h2 className="text-xs font-semibold">{client.name}</h2><p className="text-[10px] text-muted-foreground">{client.configPath ?? "Manual configuration"}</p></div></div><Badge variant="outline">{client.configured ? "Connected" : client.detected ? "Detected" : "Manual setup"}</Badge></div><div className="flex items-center justify-between gap-2"><pre className="max-h-40 min-w-0 flex-1 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px]">{clientSnippet(client, serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp")}</pre><Button variant="ghost" size="sm" aria-label={`Copy ${client.name} configuration`} onClick={() => void copyText(clientSnippet(client, serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp"), `${client.name} config`)}><Copy data-icon="inline-start" />Copy</Button></div></div>)}
      <Link to="/ai-clients" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Manage AI clients<ExternalLink className="size-3" /></Link>
    </section>}
  </div>;
}

function InfoCard({ label, children }: { label: string; children: ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-4"><p className="mb-2 text-[11px] text-muted-foreground">{label}</p><div className="text-sm">{children}</div></div>;
}
