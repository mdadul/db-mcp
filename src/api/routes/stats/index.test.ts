import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dailyStatsQuerySchema } from "./schema.ts";

test("daily stats query defaults and validates its range and source", () => {
  assert.deepEqual(dailyStatsQuerySchema.parse({}), { days: 30, source: "all" });
  assert.deepEqual(dailyStatsQuerySchema.parse({ days: "7", source: "agent" }), {
    days: 7,
    source: "agent",
  });
  for (const query of [{ days: "0" }, { days: "91" }, { days: "1.5" }, { source: "desktop" }]) {
    assert.equal(dailyStatsQuerySchema.safeParse(query).success, false);
  }
});

test("daily stats combine query and tool totals, zero-fill UTC days and filter by source", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "db-mcp-daily-stats-"));
  process.env.DATABASE_PATH = join(directory, "control.sqlite");
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const { runMigrations } = await import("../../../db/runMigrations.ts");
  await runMigrations();
  const { app } = await import("../../../app.ts");
  const { closeDb, db } = await import("../../../db/client.ts");
  const { databaseConnections, queryLogs, toolCalls } = await import("../../../db/schema.ts");
  t.after(() => {
    closeDb();
    return rm(directory, { recursive: true, force: true }).then(() => {
      delete process.env.DATABASE_PATH;
      delete process.env.ENCRYPTION_KEY;
    });
  });

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  const connectionId = "daily-stats-db";
  await db.insert(databaseConnections).values({
    id: connectionId,
    name: "Stats test database",
    type: "sqlite",
    host: "",
    port: 0,
    databaseName: ":memory:",
    username: "",
    encryptedCredentials: "{}",
  });
  await db.insert(queryLogs).values([
    {
      databaseConnectionId: connectionId,
      query: "SELECT 1",
      executionTimeMs: 20,
      rowCount: 3,
      status: "success",
      source: "mcp",
      createdAt: today,
    },
    {
      databaseConnectionId: connectionId,
      query: "SELECT 2",
      executionTimeMs: 40,
      rowCount: 2,
      status: "error",
      source: "agent",
      createdAt: today,
    },
    {
      databaseConnectionId: connectionId,
      query: "SELECT 3",
      executionTimeMs: 100,
      rowCount: 5,
      status: "success",
      source: "app",
      createdAt: new Date(today.getTime() - 86_400_000),
    },
  ]);
  await db.insert(toolCalls).values([
    { tool: "list_databases", status: "success", createdAt: today },
    { tool: "get_database_schema", status: "error", createdAt: today },
  ]);

  const response = await app.request("/api/stats/daily?days=2&source=all");
  assert.equal(response.status, 200);
  const result = (await response.json()) as {
    days: {
      date: string;
      toolCalls: number;
      queries: number;
      errors: number;
      avgMs: number | null;
      rows: number;
    }[];
  };
  assert.equal(result.days.length, 2);
  assert.deepEqual(
    result.days.map(({ date }) => date),
    [
      new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10),
      today.toISOString().slice(0, 10),
    ],
  );
  assert.deepEqual(result.days[0], {
    date: result.days[0]?.date,
    toolCalls: 0,
    queries: 1,
    errors: 0,
    avgMs: 100,
    rows: 5,
  });
  assert.deepEqual(result.days[1], {
    date: result.days[1]?.date,
    toolCalls: 2,
    queries: 2,
    errors: 2,
    avgMs: 30,
    rows: 5,
  });

  const agentResponse = await app.request("/api/stats/daily?days=2&source=agent");
  const agent = (await agentResponse.json()) as {
    days: { toolCalls: number; queries: number; errors: number; rows: number }[];
  };
  assert.equal(agent.days[1]?.toolCalls, 0);
  assert.equal(agent.days[1]?.queries, 1);
  assert.equal(agent.days[1]?.errors, 1);
  assert.equal(agent.days[1]?.rows, 2);
  assert.equal((await app.request("/api/stats/daily?days=91")).status, 400);

  const zeroFilledResponse = await app.request("/api/stats/daily?days=3&source=agent");
  const zeroFilled = (await zeroFilledResponse.json()) as {
    days: {
      date: string;
      toolCalls: number;
      queries: number;
      errors: number;
      avgMs: number | null;
      rows: number;
    }[];
  };
  assert.deepEqual(zeroFilled.days[0], {
    date: new Date(today.getTime() - 2 * 86_400_000).toISOString().slice(0, 10),
    toolCalls: 0,
    queries: 0,
    errors: 0,
    avgMs: null,
    rows: 0,
  });
});
