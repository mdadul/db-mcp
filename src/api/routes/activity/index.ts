import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../../../db/client.ts";
import { sanitizeToolArgs } from "../../../db/logToolCall.ts";
import { databaseConnections, queryLogs, toolCalls } from "../../../db/schema.ts";
import { toCsv } from "./csv.ts";
import { activityExportSchema, activityQuerySchema, type ActivityFilters } from "./schema.ts";

/** Largest export. Larger histories are truncated and flagged in the response. */
export const ACTIVITY_EXPORT_LIMIT = 10_000;
const EXPORT_COLUMNS = [
  "createdAt",
  "source",
  "kind",
  "tool",
  "databaseName",
  "status",
  "durationMs",
  "rows",
  "error",
  "hint",
  "args",
] as const;

function errorHint(error: string | null, status: string): string | null {
  if (!error && status !== "error" && status !== "timeout" && status !== "blocked") return null;
  if (!error && status === "error") {
    return "The operation failed. Check the database connection and schema, then retry.";
  }
  if (!error && status === "blocked") {
    return "Only read-only queries are allowed. Use a SELECT query and retry.";
  }
  const message = error?.toLowerCase() ?? "";
  if (status === "timeout" || message.includes("timeout") || message.includes("timed out")) {
    return "The query exceeded its time limit. Narrow the query or check database responsiveness, then retry.";
  }
  if (message.includes("syntax") || message.includes("parse")) {
    return "Check the query syntax and verify table and column names with the schema tools.";
  }
  if (message.includes("connection refused") || message.includes("econnrefused")) {
    return "Check that the database is running and that its host and port are reachable.";
  }
  if (message.includes("access denied") || message.includes("permission")) {
    return "Check that the database user has permission to run this read-only query.";
  }
  if (status === "blocked" || message.includes("only select")) {
    return "Only read-only queries are allowed. Use a SELECT query and retry.";
  }
  return error
    ? "Review the error and query details, then verify the database schema before retrying."
    : null;
}

function dateBounds(
  column: typeof queryLogs.createdAt | typeof toolCalls.createdAt,
  filters: ActivityFilters,
) {
  return [
    ...(filters.from ? [gte(column, new Date(filters.from))] : []),
    ...(filters.to ? [lte(column, new Date(filters.to))] : []),
  ];
}

/** Filter conditions for the query log and tool call tables. */
function activityConditions(filters: ActivityFilters) {
  const { databaseId, status, tool, source } = filters;
  const queryConditions = [
    ...(databaseId ? [eq(queryLogs.databaseConnectionId, databaseId)] : []),
    ...(status ? [eq(queryLogs.status, status)] : []),
    ...(tool ? [sql`coalesce(${queryLogs.toolName}, 'execute_read_query') = ${tool}`] : []),
    ...(source ? [eq(queryLogs.source, source)] : []),
    ...dateBounds(queryLogs.createdAt, filters),
  ];
  const toolConditions = [
    ...(databaseId ? [eq(toolCalls.databaseConnectionId, databaseId)] : []),
    ...(status === "success" || status === "error"
      ? [eq(toolCalls.status, status)]
      : status
        ? [sql`0 = 1`]
        : []),
    ...(tool ? [eq(toolCalls.tool, tool)] : []),
    ...(source === "app" ? [sql`0 = 1`] : []),
    ...dateBounds(toolCalls.createdAt, filters),
  ];
  return { queryConditions, toolConditions };
}

/** Merged, newest-first activity for the given filters. `limit` is the number of rows returned from `offset`. */
async function loadActivity(filters: ActivityFilters, limit: number, offset: number) {
  const { queryConditions, toolConditions } = activityConditions(filters);

  const queryItems = db
    .select({
      id: queryLogs.id,
      source: queryLogs.source,
      kind: sql<"query">`'query'`,
      tool: sql<string>`coalesce(${queryLogs.toolName}, 'execute_read_query')`,
      databaseConnectionId: queryLogs.databaseConnectionId,
      databaseName: databaseConnections.name,
      status: queryLogs.status,
      createdAt: queryLogs.createdAt,
      durationMs: queryLogs.executionTimeMs,
      rows: queryLogs.rowCount,
      error: queryLogs.error,
      args: sql<string | null>`null`,
    })
    .from(queryLogs)
    .leftJoin(databaseConnections, eq(queryLogs.databaseConnectionId, databaseConnections.id))
    .where(queryConditions.length ? and(...queryConditions) : undefined);

  const toolItems = db
    .select({
      id: toolCalls.id,
      source: sql<"mcp">`'mcp'`,
      kind: sql<"tool">`'tool'`,
      tool: toolCalls.tool,
      databaseConnectionId: toolCalls.databaseConnectionId,
      databaseName: databaseConnections.name,
      status: toolCalls.status,
      createdAt: toolCalls.createdAt,
      durationMs: sql<number | null>`null`,
      rows: sql<number | null>`null`,
      error: sql<string | null>`null`,
      args: toolCalls.args,
    })
    .from(toolCalls)
    .leftJoin(databaseConnections, eq(toolCalls.databaseConnectionId, databaseConnections.id))
    .where(toolConditions.length ? and(...toolConditions) : undefined);

  const fetchLimit = limit + offset;
  const [queryRows, toolRows, queryCount, toolCount] = await Promise.all([
    queryItems.orderBy(desc(queryLogs.createdAt)).limit(fetchLimit),
    toolItems.orderBy(desc(toolCalls.createdAt)).limit(fetchLimit),
    db
      .select({ total: count() })
      .from(queryLogs)
      .where(queryConditions.length ? and(...queryConditions) : undefined),
    db
      .select({ total: count() })
      .from(toolCalls)
      .where(toolConditions.length ? and(...toolConditions) : undefined),
  ]);

  const items = [...queryRows, ...toolRows]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(offset, offset + limit)
    .map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      args: sanitizeToolArgs(item.args),
      hint: errorHint(item.error, item.status),
    }));
  return { items, total: (queryCount[0]?.total ?? 0) + (toolCount[0]?.total ?? 0) };
}

export const activityRoutes = new Hono()
  .get("/", zValidator("query", activityQuerySchema), async (c) => {
    const { limit, offset, ...filters } = c.req.valid("query");
    return c.json(await loadActivity(filters, limit, offset));
  })
  // Export the filtered activity. Query text is never selected, so exported rows contain no SQL.
  .get("/export", zValidator("query", activityExportSchema), async (c) => {
    const { format, ...filters } = c.req.valid("query");
    const { items, total } = await loadActivity(filters, ACTIVITY_EXPORT_LIMIT, 0);
    const truncated = total > items.length;
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      c.header("Content-Disposition", `attachment; filename="db-mcp-activity-${stamp}.json"`);
      return c.json({
        exportedAt: new Date().toISOString(),
        filters,
        total,
        truncated,
        limit: ACTIVITY_EXPORT_LIMIT,
        items,
      });
    }
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="db-mcp-activity-${stamp}.csv"`);
    c.header("X-Truncated", String(truncated));
    return c.body(toCsv(items as unknown as Record<string, unknown>[], EXPORT_COLUMNS));
  });
