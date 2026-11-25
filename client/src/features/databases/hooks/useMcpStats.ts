import { useQuery } from "@tanstack/react-query";

import { getApiClient } from "@/api/client";

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
  return useQuery({
    queryKey: ["mcp", "stats"],
    queryFn: async () => {
      const client = await getApiClient();
      const response = await client.api.stats.$get();
      if (!response.ok) throw new Error("Failed to load MCP usage statistics");
      return response.json() as Promise<McpStats>;
    },
  });
}
