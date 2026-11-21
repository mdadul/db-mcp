import { getApiClient } from "@/api/client";

export type ActivityStatus = "success" | "error" | "timeout" | "blocked";

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
}

export async function getActivity(filters: ActivityFilters): Promise<ActivityResponse> {
  const client = await getApiClient();
  const response = await client.api.activity.$get({ query: {
    limit: String(filters.limit),
    offset: String(filters.offset),
    ...(filters.databaseId ? { databaseId: filters.databaseId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.tool ? { tool: filters.tool } : {}),
  } });
  if (!response.ok) throw new Error("Could not load recent activity");
  return response.json();
}
