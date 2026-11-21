import { platform } from "@/platform";

export type ActivityStatus = "success" | "error" | "timeout" | "blocked";
export type ActivitySource = "mcp" | "agent" | "app";

export interface ActivityItem {
  id: string;
  kind: "query" | "tool";
  tool: string;
  databaseConnectionId: string | null;
  databaseName: string | null;
  status: string;
  createdAt: string;
  durationMs: number | null;
  rows: number | null;
  error: string | null;
  source: ActivitySource;
  args?: string | null;
  hint?: string | null;
}

export interface ActivityResponse {
  items: ActivityItem[];
  total: number;
}

export interface ActivityFilters {
  limit: number;
  offset: number;
  databaseId?: string;
  status?: ActivityStatus;
  tool?: string;
  source?: ActivitySource;
}

export async function getActivity(filters: ActivityFilters): Promise<ActivityResponse> {
  const query = new URLSearchParams({ limit: String(filters.limit), offset: String(filters.offset) });
  if (filters.databaseId) query.set("databaseId", filters.databaseId);
  if (filters.status) query.set("status", filters.status);
  if (filters.tool) query.set("tool", filters.tool);
  if (filters.source) query.set("source", filters.source);
  const serverInfo = await platform.getServerInfo();
  const response = await fetch(`${serverInfo.baseUrl}/api/activity?${query}`, { headers: { "X-App-Session": serverInfo.sessionToken } });
  if (!response.ok) throw new Error("Could not load recent activity");
  return response.json();
}
