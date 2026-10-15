import React from "react";
import type { DatabaseConnection } from "../types";
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
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatTile label="Total Connections" value={total} sub="configured" icon={<Database className="w-4 h-4" />} />
      <StatTile label="Enabled Status" value={enabledCount} sub={`of ${total} active`} icon={<CheckCircle2 className="w-4 h-4" />} accent />
      <StatTile label="Production Env" value={prodCount} sub="protected" icon={<Server className="w-4 h-4" />} />
      <StatTile label="Safety Guardrail" value="Active" sub="read-only mode" icon={<ShieldCheck className="w-4 h-4" />} accent />
    </div>
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
    <div className="group relative flex items-center justify-between rounded-[14px] border border-[#EEEEEE] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] hover:border-[#CCCCCC] transition-all duration-200">
      <div>
        <p className="text-xs text-[#737373] font-normal">{label}</p>
        <p className="mt-1 text-2xl sm:text-3xl font-medium text-[#0A0A0A] tabular-nums tracking-tight">
          {value}
        </p>
        <p className="text-xs text-[#999999] mt-0.5">{sub}</p>
      </div>

      <div className={`flex h-10 w-10 items-center justify-center rounded-[10px] border transition-colors ${
        accent
          ? "bg-[#22C55E]/10 border-[#22C55E]/20 text-[#15803D]"
          : "bg-[#F8F8F8] border-[#EEEEEE] text-[#4D4D4D]"
      }`}>
        {icon}
      </div>
    </div>
  );
}
