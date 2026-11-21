import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../../db/client.ts";
import { sanitizeToolArgs } from "../../../db/logToolCall.ts";
import { databaseConnections, queryLogs, toolCalls } from "../../../db/schema.ts";
import { activityQuerySchema } from "./schema.ts";

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
  return error ? "Review the error and query details, then verify the database schema before retrying." : null;
}

export const activityRoutes = new Hono().get(
  "/",
  zValidator("query", activityQuerySchema),
  async (c) => {
    const { limit, offset, databaseId, status, tool, source } = c.req.valid("query");
    const queryConditions = [
      ...(databaseId ? [eq(queryLogs.databaseConnectionId, databaseId)] : []),
      ...(status ? [eq(queryLogs.status, status)] : []),
      ...(tool ? [sql`coalesce(${queryLogs.toolName}, 'execute_read_query') = ${tool}`] : []),
      ...(source ? [eq(queryLogs.source, source)] : []),
    ];
    const toolConditions = [
      ...(databaseId ? [eq(toolCalls.databaseConnectionId, databaseId)] : []),
      ...(status === "success" || status === "error" ? [eq(toolCalls.status, status)] : status ? [sql`0 = 1`] : []),
      ...(tool ? [eq(toolCalls.tool, tool)] : []),
      ...(source === "app" || source === "agent" ? [sql`0 = 1`] : []),
    ];

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
      db.select({ total: count() }).from(queryLogs).where(queryConditions.length ? and(...queryConditions) : undefined),
      db.select({ total: count() }).from(toolCalls).where(toolConditions.length ? and(...toolConditions) : undefined),
    ]);

    const items = [...queryRows, ...toolRows]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(offset, offset + limit);

    return c.json({
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        args: sanitizeToolArgs(item.args),
        hint: errorHint(item.error, item.status),
      })),
      total: (queryCount[0]?.total ?? 0) + (toolCount[0]?.total ?? 0),
    });
  }
);
