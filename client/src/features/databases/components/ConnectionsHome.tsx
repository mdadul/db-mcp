import { ArrowUpRight, Cable, Code2, Plus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { StatusDot } from "@/components/ui/StatusDot";
import { DbEngineIcon } from "@/components/brand/DbEngineIcon";
import type { DatabaseConnection } from "../types";

export interface RecentTableItem {
  connectionId: string;
  connectionName: string;
  engine: string;
  schema: string;
  table: string;
}

export interface RecentQueryItem {
  connectionId: string;
  connectionName: string;
  engine: string;
  query: string;
}

export interface ConnectionsHomeProps {
  connections: DatabaseConnection[];
  testStates: Record<string, "reachable" | "unreachable">;
  recentTables: RecentTableItem[];
  recentQueries: RecentQueryItem[];
  mcpUrl: string;
  onNewConnection: () => void;
  onOpenTable: (item: RecentTableItem) => void;
  onOpenQuery: (item: RecentQueryItem) => void;
  onOpenAiClients: () => void;
}

/** Landing view for the workbench when no connection is selected. */
export function ConnectionsHome({ connections, testStates, recentTables, recentQueries, mcpUrl, onNewConnection, onOpenTable, onOpenQuery, onOpenAiClients }: ConnectionsHomeProps) {
  const enabled = connections.filter((item) => item.status === "enabled");
  const disabled = connections.length - enabled.length;
  const reachable = enabled.filter((item) => testStates[item.id] === "reachable").length;
  const unreachable = enabled.filter((item) => testStates[item.id] === "unreachable").length;
  const untested = enabled.length - reachable - unreachable;

  return <div className="min-h-0 flex-1 overflow-y-auto bg-background">
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-ui-title font-semibold">Your databases</h2>
          <p className="mt-1 max-w-xl text-ui-sm text-muted-foreground">Browse schemas, run read-only queries, and give AI clients local access to your data.</p>
        </div>
        <Button onClick={onNewConnection}><Plus data-icon="inline-start" />New connection</Button>
      </header>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Connection health</CardTitle>
          <CardDescription>Reachability reflects the last connection test in this session. Disabled connections are never queried.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-ui-sm">
            <HealthStat state="healthy" label="Enabled" value={enabled.length} />
            <HealthStat state="neutral" label="Disabled" value={disabled} />
            <HealthStat state="healthy" label="Reachable" value={reachable} />
            <HealthStat state="error" label="Unreachable" value={unreachable} />
            {untested > 0 && <span className="text-ui-xs text-muted-foreground">{untested} untested</span>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5"><Table2 className="size-3.5" />Recent tables</CardTitle>
            <CardDescription>Tables and collections you opened, across connections.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentTables.length ? <div className="flex flex-col gap-0.5">{recentTables.map((item) => <button key={`${item.connectionId}-${item.schema}-${item.table}`} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open ${item.schema ? `${item.schema}.` : ""}${item.table} on ${item.connectionName}`} title={`${item.schema ? `${item.schema}.` : ""}${item.table} · ${item.connectionName}`} onClick={() => onOpenTable(item)}><DbEngineIcon type={item.engine} /><span className="min-w-0 flex-1 truncate text-ui-sm">{item.table}</span><span className="max-w-40 truncate text-ui-xs text-muted-foreground">{item.schema ? `${item.schema} · ` : ""}{item.connectionName}</span></button>)}</div> : <p className="px-2 py-2 text-ui-sm text-muted-foreground">Open a table or collection to see it here.</p>}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5"><Code2 className="size-3.5" />Recent queries</CardTitle>
            <CardDescription>Queries you ran, across connections.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentQueries.length ? <div className="flex flex-col gap-0.5">{recentQueries.map((item, index) => <button key={`${item.connectionId}-${index}-${item.query}`} type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open query on ${item.connectionName}`} title={item.query} onClick={() => onOpenQuery(item)}><DbEngineIcon type={item.engine} /><code className="min-w-0 flex-1 truncate font-mono text-ui-xs">{item.query.replace(/\s+/g, " ").trim()}</code><span className="max-w-32 shrink-0 truncate text-ui-xs text-muted-foreground">{item.connectionName}</span></button>)}</div> : <p className="px-2 py-2 text-ui-sm text-muted-foreground">Run a query to see it here.</p>}
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5"><Cable className="size-3.5" />Connect an AI client</CardTitle>
          <CardDescription>Point Claude, Cursor, VS Code, or another MCP client at this computer's local endpoint.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded border border-border bg-muted px-2 py-1 font-mono text-ui-xs" title={mcpUrl}>{mcpUrl}</code>
          <CopyButton value={mcpUrl} label="Copy URL" />
          <Button size="sm" variant="outline" onClick={onOpenAiClients}>Open AI Clients<ArrowUpRight data-icon="inline-end" /></Button>
        </CardContent>
      </Card>
    </div>
  </div>;
}

function HealthStat({ state, label, value }: { state: "healthy" | "warning" | "error" | "neutral"; label: string; value: number }) {
  return <span className="inline-flex items-center gap-1.5"><StatusDot state={state} /><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums text-foreground">{value}</span></span>;
}
