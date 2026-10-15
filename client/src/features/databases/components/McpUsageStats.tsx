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
      <Card className="border-[#EEEEEE] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] rounded-[14px]">
        <div className="p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#F8F8F8] border border-[#EEEEEE] text-[#4D4D4D] shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-[#737373]">MCP Activity</p>
            <p className="mt-0.5 text-sm text-[#4D4D4D]">
              No tool activity recorded yet. Connect an AI assistant to monitor live analytics.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const { queries, byTool, byDatabase, windowDays, totalToolCalls } = stats;
  const errorRate = queries.total > 0 ? Math.round((queries.errors / queries.total) * 100) : 0;

  return (
    <Card className="border-[#EEEEEE] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] rounded-[14px] overflow-hidden p-0">
      <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between bg-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#E5E5E5] text-[#0A0A0A]">
            <Activity className="w-4 h-4" />
          </div>
          <p className="text-sm font-medium text-[#0A0A0A]">MCP Analytics</p>
        </div>
        <p className="text-xs text-[#737373]">Last {windowDays} days</p>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatTile label="Tool Calls" value={totalToolCalls.toLocaleString()} sub="total executed" icon={<Activity className="w-4 h-4" />} />
          <StatTile label="Queries" value={queries.total.toLocaleString()} sub={`${queries.totalRows.toLocaleString()} rows returned`} icon={<Zap className="w-4 h-4" />} />
          <StatTile
            label="Avg Latency"
            value={queries.avgMs != null ? `${queries.avgMs}ms` : "—"}
            sub="per query"
            icon={<Clock className="w-4 h-4" />}
          />
          <StatTile
            label="Error Rate"
            value={`${errorRate}%`}
            sub={`${queries.errors} failed`}
            icon={<ShieldAlert className="w-4 h-4" />}
            destructive={errorRate > 0}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] p-5">
            <p className="mb-4 text-xs text-[#737373] uppercase tracking-wider">By Tool</p>
            <div className="space-y-3.5">
              {byTool.map((t) => {
                const pct = totalToolCalls > 0 ? Math.round((t.total / totalToolCalls) * 100) : 0;
                return (
                  <div key={t.tool}>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="font-normal text-[#0A0A0A]">{TOOL_LABELS[t.tool] ?? t.tool}</span>
                      <span className="text-[#737373] tabular-nums">{t.total.toLocaleString()} · {pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#EEEEEE]">
                      <div
                        className="h-full rounded-full bg-[#4D4D4D] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {byDatabase.length > 0 && (
            <div className="rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] p-5">
              <p className="mb-4 text-xs text-[#737373] uppercase tracking-wider">By Database</p>
              <div className="space-y-3.5">
                {byDatabase.slice(0, 6).map((d) => {
                  const pct = totalToolCalls > 0 ? Math.round((d.total / totalToolCalls) * 100) : 0;
                  return (
                    <div key={d.databaseConnectionId}>
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span className="font-normal text-[#0A0A0A] truncate max-w-[60%]">{d.name ?? "Unknown"}</span>
                        <span className="text-[#737373] tabular-nums">{d.total.toLocaleString()} · {pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#EEEEEE]">
                        <div
                          className="h-full rounded-full bg-[#4D4D4D] transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function StatTile({
  label,
  value,
  sub,
  icon,
  destructive,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  destructive?: boolean;
}) {
  const valueColor = destructive ? "text-[#D64545]" : "text-[#0A0A0A]";

  return (
    <div className="flex items-center justify-between rounded-[10px] border border-[#EEEEEE] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div>
        <p className="text-xs text-[#737373]">{label}</p>
        <p className={`mt-1 text-2xl font-medium tabular-nums ${valueColor}`}>{value}</p>
        <p className="text-xs text-[#999999] mt-0.5">{sub}</p>
      </div>
      <div className={`flex h-9 w-9 items-center justify-center rounded-[8px] border ${
        destructive
          ? "bg-[#D64545]/10 border-[#D64545]/20 text-[#D64545]"
          : "bg-[#F8F8F8] border-[#EEEEEE] text-[#4D4D4D]"
      }`}>
        {icon}
      </div>
    </div>
  );
}
