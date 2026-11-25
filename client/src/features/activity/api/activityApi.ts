import { platform } from "@/platform";

export type ActivityStatus = "success" | "error" | "timeout" | "blocked";
export type ActivitySource = "mcp" | "agent" | "app";
export type DailyStatsSource = ActivitySource | "all";

export interface DailyActivityStat {
  date: string;
  toolCalls: number;
  queries: number;
  errors: number;
  avgMs: number | null;
  rows: number;
}

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
  args: string | null;
  hint: string | null;
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
  from?: string;
}

export async function getActivity(filters: ActivityFilters): Promise<ActivityResponse> {
  const query = new URLSearchParams({
    limit: String(filters.limit),
    offset: String(filters.offset),
  });
  if (filters.databaseId) query.set("databaseId", filters.databaseId);
  if (filters.status) query.set("status", filters.status);
  if (filters.tool) query.set("tool", filters.tool);
  if (filters.source) query.set("source", filters.source);
  if (filters.from) query.set("from", filters.from);
  const serverInfo = await platform.getServerInfo();
  const response = await fetch(`${serverInfo.baseUrl}/api/activity?${query}`, {
    headers: { "X-App-Session": serverInfo.sessionToken },
  });
  if (!response.ok) throw new Error("Could not load recent activity");
  return response.json();
}

/** Downloads the filtered activity as a file. The server caps exports and flags truncation in the CSV header. */
export async function exportActivity(
  format: "csv" | "json",
  filters: Omit<ActivityFilters, "limit" | "offset">,
): Promise<{ blob: Blob; truncated: boolean }> {
  const query = new URLSearchParams({ format });
  if (filters.databaseId) query.set("databaseId", filters.databaseId);
  if (filters.status) query.set("status", filters.status);
  if (filters.tool) query.set("tool", filters.tool);
  if (filters.source) query.set("source", filters.source);
  if (filters.from) query.set("from", filters.from);
  const serverInfo = await platform.getServerInfo();
  const response = await fetch(`${serverInfo.baseUrl}/api/activity/export?${query}`, {
    headers: { "X-App-Session": serverInfo.sessionToken },
  });
  if (!response.ok) throw new Error("Could not export activity");
  return { blob: await response.blob(), truncated: response.headers.get("X-Truncated") === "true" };
}

export async function getDailyActivityStats(
  source: DailyStatsSource,
): Promise<DailyActivityStat[]> {
  const serverInfo = await platform.getServerInfo();
  const response = await fetch(`${serverInfo.baseUrl}/api/stats/daily?days=30&source=${source}`, {
    headers: { "X-App-Session": serverInfo.sessionToken },
  });
  if (!response.ok) throw new Error("Could not load daily usage statistics");
  const result = (await response.json()) as { days: DailyActivityStat[] };
  return result.days;
}
