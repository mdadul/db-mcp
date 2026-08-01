import { useEffect, useState } from "react";

export interface ToolStat {
  tool: string;
  total: number;
  errors: number;
}

export interface DbStat {
  databaseConnectionId: string | null;
  name: string | null;
  total: number;
  errors: number;
}

export interface McpStats {
  windowDays: number;
  totalToolCalls: number;
  byTool: ToolStat[];
  queries: {
    total: number;
    success: number;
    errors: number;
    avgMs: number | null;
    totalRows: number;
  };
  byDatabase: DbStat[];
}

export function useMcpStats() {
  const [stats, setStats] = useState<McpStats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return stats;
}
