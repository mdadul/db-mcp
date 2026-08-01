import React from "react";
import type { DatabaseConnection } from "../types";
import { Card } from "@/components/ui/Card";
import { Database, CheckCircle2, Server, ShieldCheck } from "@/components/ui/Icons";

export interface DatabaseStatsBarProps {
  databases: DatabaseConnection[];
}

export function DatabaseStatsBar({ databases }: DatabaseStatsBarProps) {
  const total = databases.length;
  const enabledCount = databases.filter((d) => d.status === "enabled").length;
  const prodCount = databases.filter(
    (d) => d.environment?.toLowerCase() === "production" || d.environment?.toLowerCase() === "prod"
  ).length;

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your databases</p>
        <p className="text-xs text-muted-foreground">Live status</p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Total" value={total} sub="connections" icon={<Database className="w-4 h-4" />} />
        <StatTile label="Enabled" value={enabledCount} sub={`of ${total}`} icon={<CheckCircle2 className="w-4 h-4" />} accent />
        <StatTile label="Production" value={prodCount} sub="databases" icon={<Server className="w-4 h-4" />} accent />
        <StatTile label="Guardrail" value="Active" sub="read-only" icon={<ShieldCheck className="w-4 h-4" />} accent />
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
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
        accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      }`}>
        {icon}
      </div>
    </div>
  );
}
