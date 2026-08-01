import { Hono } from "hono";
import { db } from "../../../db/client.ts";
import { toolCalls, queryLogs, databaseConnections } from "../../../db/schema.ts";
import { sql, eq, and, gte } from "drizzle-orm";

export const statsRoutes = new Hono().get("/", async (c) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

  const [toolTotals, queryStats, perDb] = await Promise.all([
    // Tool call counts by tool name
    db
      .select({
        tool: toolCalls.tool,
        total: sql<number>`count(*)`,
        errors:
          sql<number>`coalesce(sum(case when ${toolCalls.status} = 'error' then 1 else 0 end), 0)`,
      })
      .from(toolCalls)
      .where(gte(toolCalls.createdAt, since))
      .groupBy(toolCalls.tool),

    // Overall query stats from query_logs
    db
      .select({
        total: sql<number>`count(*)`,
        success:
          sql<number>`coalesce(sum(case when ${queryLogs.status} = 'success' then 1 else 0 end), 0)`,
        errors:
          sql<number>`coalesce(sum(case when ${queryLogs.status} = 'error' then 1 else 0 end), 0)`,
        avgMs: sql<number>`cast(round(avg(${queryLogs.executionTimeMs})) as integer)`,
        totalRows: sql<number>`coalesce(sum(${queryLogs.rowCount}), 0)`,
      })
      .from(queryLogs)
      .where(gte(queryLogs.createdAt, since)),

    // Per-database tool call breakdown
    db
      .select({
        databaseConnectionId: toolCalls.databaseConnectionId,
        name: databaseConnections.name,
        total: sql<number>`count(*)`,
        errors:
          sql<number>`coalesce(sum(case when ${toolCalls.status} = 'error' then 1 else 0 end), 0)`,
      })
      .from(toolCalls)
      .leftJoin(
        databaseConnections,
        eq(toolCalls.databaseConnectionId, databaseConnections.id)
      )
      .where(
        and(
          gte(toolCalls.createdAt, since),
          sql`${toolCalls.databaseConnectionId} is not null`
        )
      )
      .groupBy(toolCalls.databaseConnectionId, databaseConnections.name)
      .orderBy(sql`count(*) desc`),
  ]);

  const totalToolCalls = toolTotals.reduce((s, r) => s + r.total, 0);

  return c.json({
    windowDays: 30,
    totalToolCalls,
    byTool: toolTotals,
    queries: queryStats[0] ?? { total: 0, success: 0, errors: 0, avgMs: null, totalRows: 0 },
    byDatabase: perDb,
  });
});
