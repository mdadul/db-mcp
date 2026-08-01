import React from "react";
import { Card } from "@/components/ui/Card";
import { Activity, Zap, Clock, ShieldAlert } from "@/components/ui/Icons";
import { useMcpStats } from "../hooks/useMcpStats";

const TOOL_LABELS: Record<string, string> = {
  list_databases: "List DBs",
  get_database_schema: "Schema",
  get_table_schema: "Table Schema",
  execute_read_query: "Run Query",
};

export function McpUsageStats() {
  const stats = useMcpStats();

  if (!stats || (stats.totalToolCalls === 0 && stats.queries.total === 0)) {
    return (
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">MCP Usage</p>
        <p className="mt-2 text-sm text-muted-foreground">
          No tool activity yet. Connect an AI agent to start seeing analytics.
        </p>
      </Card>
    );
  }

  const { queries, byTool, byDatabase, windowDays, totalToolCalls } = stats;
  const errorRate = queries.total > 0 ? Math.round((queries.errors / queries.total) * 100) : 0;

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">MCP Usage</p>
        <p className="text-xs text-muted-foreground">Last {windowDays} days</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Tool Calls" value={totalToolCalls.toLocaleString()} sub="total" icon={<Activity className="w-4 h-4" />} accent />
        <StatTile label="Queries" value={queries.total.toLocaleString()} sub={`${queries.totalRows.toLocaleString()} rows`} icon={<Zap className="w-4 h-4" />} accent />
        <StatTile
          label="Avg Latency"
          value={queries.avgMs != null ? `${queries.avgMs}ms` : "—"}
          sub="per query"
          icon={<Clock className="w-4 h-4" />}
        />
        <StatTile
          label="Error Rate"
          value={`${errorRate}%`}
          sub={`${queries.errors} errors`}
          icon={<ShieldAlert className="w-4 h-4" />}
          destructive={errorRate > 0}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="p-3.5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By Tool</p>
          <div className="space-y-2.5">
            {byTool.map((t) => {
              const pct = totalToolCalls > 0 ? Math.round((t.total / totalToolCalls) * 100) : 0;
              return (
                <div key={t.tool}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-foreground">{TOOL_LABELS[t.tool] ?? t.tool}</span>
                    <span className="text-muted-foreground">{t.total.toLocaleString()} · {pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {byDatabase.length > 0 && (
          <Card className="p-3.5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By Database</p>
            <div className="space-y-2.5">
              {byDatabase.slice(0, 6).map((d) => {
                const pct = totalToolCalls > 0 ? Math.round((d.total / totalToolCalls) * 100) : 0;
                return (
                  <div key={d.databaseConnectionId}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-foreground truncate max-w-[60%]">{d.name ?? "Unknown"}</span>
                      <span className="text-muted-foreground">{d.total.toLocaleString()} · {pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </Card>
  );
}

function StatTile({
  label,
  value,
  sub,
  icon,
  accent,
  destructive,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  accent?: boolean;
  destructive?: boolean;
}) {
  const color = destructive ? "text-destructive" : accent ? "text-primary" : "text-foreground";
  const iconBg = destructive ? "bg-destructive/10 text-destructive" : accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>{icon}</div>
    </div>
  );
}
