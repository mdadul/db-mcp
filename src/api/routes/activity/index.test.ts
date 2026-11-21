import assert from "node:assert/strict";
import test from "node:test";
import { activityQuerySchema } from "./schema.ts";

test("activity query defaults pagination and coerces numeric values", () => {
  assert.deepEqual(activityQuerySchema.parse({}), { limit: 50, offset: 0 });
  assert.deepEqual(activityQuerySchema.parse({ limit: "25", offset: "10" }), {
    limit: 25,
    offset: 10,
  });
});

test("activity query caps page size and rejects invalid filters", () => {
  assert.equal(activityQuerySchema.safeParse({ limit: "201" }).success, false);
  assert.equal(activityQuerySchema.safeParse({ offset: "-1" }).success, false);
  assert.equal(activityQuerySchema.safeParse({ offset: "10001" }).success, false);
  assert.equal(activityQuerySchema.safeParse({ status: "unknown" }).success, false);
  assert.equal(activityQuerySchema.safeParse({ tool: " " }).success, false);
  assert.deepEqual(activityQuerySchema.parse({ source: "app" }), { limit: 50, offset: 0, source: "app" });
  assert.deepEqual(activityQuerySchema.parse({ source: "agent" }), { limit: 50, offset: 0, source: "agent" });
  assert.equal(activityQuerySchema.safeParse({ source: "desktop" }).success, false);
});

test("activity endpoint filters Analyst source and returns redacted tool arguments with safe error hints", async (t) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "db-mcp-activity-"));
  process.env.DATABASE_PATH = join(directory, "control.sqlite");
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const { runMigrations } = await import("../../../db/runMigrations.ts");
  await runMigrations();
  const { app } = await import("../../../app.ts");
  const { closeDb, db } = await import("../../../db/client.ts");
  const { sanitizeToolArgs } = await import("../../../db/logToolCall.ts");
  const { databaseConnections, queryLogs, toolCalls } = await import("../../../db/schema.ts");
  t.after(() => {
    closeDb();
    return rm(directory, { recursive: true, force: true }).then(() => {
      delete process.env.DATABASE_PATH;
      delete process.env.ENCRYPTION_KEY;
    });
  });

  const connectionId = "activity-details-db";
  const sanitizedArgs = sanitizeToolArgs({
    password: "never-return-this",
    endpoint: "postgres://db-user:db-password@localhost/app",
    query: "SELECT * FROM users WHERE email = 'person@example.com'",
  });
  assert.ok(sanitizedArgs?.includes("[REDACTED]"));
  assert.ok(!sanitizedArgs?.includes("never-return-this"));
  assert.ok(!sanitizedArgs?.includes("db-password"));
  assert.ok(!sanitizedArgs?.includes("person@example.com"));
  assert.ok(new TextEncoder().encode(sanitizeToolArgs({ value: "x".repeat(3_000) }) ?? "").byteLength <= 2 * 1024);

  await db.insert(databaseConnections).values({ id: connectionId, name: "Activity test", type: "sqlite", host: "", port: 0, databaseName: ":memory:", username: "", encryptedCredentials: "{}" });
  await db.insert(queryLogs).values({ databaseConnectionId: connectionId, query: "SELECT secret", executionTimeMs: 1, rowCount: 0, status: "error", error: "syntax error", source: "agent" });
  await db.insert(toolCalls).values({
    tool: "execute_read_query",
    status: "error",
    args: JSON.stringify({ database_id: connectionId, filter: "users", query: "SELECT * FROM users WHERE email = 'person@example.com'", password: "never-return-this", extra: "x".repeat(3_000) }),
  });

  const agentResponse = await app.request("/api/activity?source=agent");
  const agentResult = await agentResponse.json() as { items: { source: string; error: string | null; hint: string | null; args: string | null }[]; total: number };
  assert.equal(agentResult.total, 1);
  assert.equal(agentResult.items[0]?.source, "agent");
  assert.equal(agentResult.items[0]?.hint, "Check the query syntax and verify table and column names with the schema tools.");
  assert.equal(agentResult.items[0]?.args, null);

  const mcpResponse = await app.request("/api/activity?source=mcp");
  const mcpResult = await mcpResponse.json() as { items: { hint: string | null; args: string | null }[]; total: number };
  assert.equal(mcpResult.total, 1);
  assert.match(mcpResult.items[0]?.hint ?? "", /operation failed/);
  assert.ok(mcpResult.items[0]?.args?.includes('"filter":"users"'));
  assert.ok(mcpResult.items[0]?.args?.includes("[REDACTED]"));
  assert.ok(!mcpResult.items[0]?.args?.includes("never-return-this"));
  assert.ok(!mcpResult.items[0]?.args?.includes("person@example.com"));
  assert.ok(new TextEncoder().encode(mcpResult.items[0]?.args ?? "").byteLength <= 2 * 1024);

  await db.insert(queryLogs).values({ databaseConnectionId: connectionId, query: "UPDATE users SET name = 'x'", executionTimeMs: 1, rowCount: 0, status: "blocked", source: "app" });
  const blockedResponse = await app.request("/api/activity?source=app");
  const blocked = await blockedResponse.json() as { items: { hint: string | null }[] };
  assert.match(blocked.items[0]?.hint ?? "", /Only read-only queries/);
});
