import { zValidator } from "@hono/zod-validator";
import { sql, eq, and, gte, lt } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../../../db/client.ts";
import { toolCalls, queryLogs, databaseConnections } from "../../../db/schema.ts";
import { dailyStatsQuerySchema } from "./schema.ts";

export const statsRoutes = new Hono()
  .get("/daily", zValidator("query", dailyStatsQuerySchema), async (c) => {
    const { days, source } = c.req.valid("query");
    const today = new Date();
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    start.setUTCDate(start.getUTCDate() - days + 1);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + days);
    const queryConditions = [
      gte(queryLogs.createdAt, start),
      lt(queryLogs.createdAt, end),
      ...(source === "all" ? [] : [eq(queryLogs.source, source)]),
    ];
    const toolConditions = [
      gte(toolCalls.createdAt, start),
      lt(toolCalls.createdAt, end),
      ...(source === "all" || source === "mcp" ? [] : [sql`0 = 1`]),
    ];
    const dayExpression = (column: typeof queryLogs.createdAt | typeof toolCalls.createdAt) =>
      sql<string>`strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch')`;

    const [queryDays, toolDays] = await Promise.all([
      db
        .select({
          date: dayExpression(queryLogs.createdAt),
          queries: sql<number>`count(*)`,
          errors: sql<number>`coalesce(sum(case when ${queryLogs.status} != 'success' then 1 else 0 end), 0)`,
          avgMs: sql<number | null>`cast(round(avg(${queryLogs.executionTimeMs})) as integer)`,
          rows: sql<number>`coalesce(sum(${queryLogs.rowCount}), 0)`,
        })
        .from(queryLogs)
        .where(and(...queryConditions))
        .groupBy(dayExpression(queryLogs.createdAt)),
      db
        .select({
          date: dayExpression(toolCalls.createdAt),
          toolCalls: sql<number>`count(*)`,
          errors: sql<number>`coalesce(sum(case when ${toolCalls.status} = 'error' then 1 else 0 end), 0)`,
        })
        .from(toolCalls)
        .where(and(...toolConditions))
        .groupBy(dayExpression(toolCalls.createdAt)),
    ]);

    const byDate = new Map<
      string,
      { toolCalls: number; queries: number; errors: number; avgMs: number | null; rows: number }
    >();
    for (const row of queryDays) {
      byDate.set(row.date, {
        toolCalls: 0,
        queries: row.queries,
        errors: row.errors,
        avgMs: row.avgMs,
        rows: row.rows,
      });
    }
    for (const row of toolDays) {
      const current = byDate.get(row.date) ?? {
        toolCalls: 0,
        queries: 0,
        errors: 0,
        avgMs: null,
        rows: 0,
      };
      current.toolCalls = row.toolCalls;
      current.errors += row.errors;
      byDate.set(row.date, current);
    }

    const daily = Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      const formatted = date.toISOString().slice(0, 10);
      return {
        date: formatted,
        ...(byDate.get(formatted) ?? { toolCalls: 0, queries: 0, errors: 0, avgMs: null, rows: 0 }),
      };
    });
    return c.json({ days: daily });
  })
  .get("/", async (c) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

    const [toolTotals, queryStats, perDb] = await Promise.all([
      // Tool call counts by tool name
      db
        .select({
          tool: toolCalls.tool,
          total: sql<number>`count(*)`,
          errors: sql<number>`coalesce(sum(case when ${toolCalls.status} = 'error' then 1 else 0 end), 0)`,
        })
        .from(toolCalls)
        .where(gte(toolCalls.createdAt, since))
        .groupBy(toolCalls.tool),

      // Overall query stats from query_logs
      db
        .select({
          total: sql<number>`count(*)`,
          success: sql<number>`coalesce(sum(case when ${queryLogs.status} = 'success' then 1 else 0 end), 0)`,
          errors: sql<number>`coalesce(sum(case when ${queryLogs.status} = 'error' then 1 else 0 end), 0)`,
          avgMs: sql<number>`cast(round(avg(${queryLogs.executionTimeMs})) as integer)`,
          totalRows: sql<number>`coalesce(sum(${queryLogs.rowCount}), 0)`,
        })
        .from(queryLogs)
        .where(and(gte(queryLogs.createdAt, since), eq(queryLogs.source, "mcp"))),

      // Per-database tool call breakdown
      db
        .select({
          databaseConnectionId: toolCalls.databaseConnectionId,
          name: databaseConnections.name,
          total: sql<number>`count(*)`,
          errors: sql<number>`coalesce(sum(case when ${toolCalls.status} = 'error' then 1 else 0 end), 0)`,
        })
        .from(toolCalls)
        .leftJoin(databaseConnections, eq(toolCalls.databaseConnectionId, databaseConnections.id))
        .where(
          and(gte(toolCalls.createdAt, since), sql`${toolCalls.databaseConnectionId} is not null`),
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
