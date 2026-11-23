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
  assert.equal(activityQuerySchema.safeParse({ source: "agent" }).success, false);
  assert.equal(activityQuerySchema.safeParse({ source: "desktop" }).success, false);
});

test("activity endpoint returns redacted tool arguments with safe error hints", async (t) => {
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
  await db.insert(queryLogs).values({ databaseConnectionId: connectionId, query: "SELECT secret", executionTimeMs: 1, rowCount: 0, status: "error", error: "syntax error", source: "mcp" });
  await db.insert(toolCalls).values({
    tool: "execute_read_query",
    status: "error",
    args: JSON.stringify({ database_id: connectionId, filter: "users", query: "SELECT * FROM users WHERE email = 'person@example.com'", password: "never-return-this", extra: "x".repeat(3_000) }),
  });

  const mcpResponse = await app.request("/api/activity?source=mcp");
  const mcpResult = await mcpResponse.json() as { items: { kind: string; hint: string | null; args: string | null }[]; total: number };
  assert.equal(mcpResult.total, 2);
  const queryItem = mcpResult.items.find((item) => item.kind === "query");
  const toolItem = mcpResult.items.find((item) => item.kind === "tool");
  assert.equal(queryItem?.hint, "Check the query syntax and verify table and column names with the schema tools.");
  assert.equal(queryItem?.args, null);
  assert.match(toolItem?.hint ?? "", /operation failed/);
  assert.ok(toolItem?.args?.includes('"filter":"users"'));
  assert.ok(toolItem?.args?.includes("[REDACTED]"));
  assert.ok(!toolItem?.args?.includes("never-return-this"));
  assert.ok(!toolItem?.args?.includes("person@example.com"));
  assert.ok(new TextEncoder().encode(toolItem?.args ?? "").byteLength <= 2 * 1024);

  await db.insert(queryLogs).values({ databaseConnectionId: connectionId, query: "UPDATE users SET name = 'x'", executionTimeMs: 1, rowCount: 0, status: "blocked", source: "app" });
  const blockedResponse = await app.request("/api/activity?source=app");
  const blocked = await blockedResponse.json() as { items: { hint: string | null }[] };
  assert.match(blocked.items[0]?.hint ?? "", /Only read-only queries/);
  // Export uses the same filters and never includes SQL text or secrets.
  const csvExport = await app.request("/api/activity/export?source=mcp");
  assert.equal(csvExport.status, 200);
  assert.match(csvExport.headers.get("content-type") ?? "", /text\/csv/);
  assert.equal(csvExport.headers.get("x-truncated"), "false");
  const csvText = await csvExport.text();
  assert.match(csvText.split("\r\n")[0] ?? "", /^createdAt,source,kind,tool/);
  assert.ok(csvText.includes("execute_read_query"));
  assert.ok(!csvText.includes("never-return-this"));
  assert.ok(!csvText.includes("person@example.com"));
  assert.ok(!csvText.includes("SELECT secret"));

  const jsonExport = await app.request("/api/activity/export?format=json&source=mcp");
  const exported = await jsonExport.json() as { total: number; truncated: boolean; items: unknown[] };
  assert.equal(exported.total, mcpResult.total);
  assert.equal(exported.items.length, mcpResult.total);
  assert.equal(exported.truncated, false);

  // Date range: windows that cannot match return nothing.
  const future = await app.request("/api/activity?from=2999-01-01T00:00:00.000Z");
  assert.equal((await future.json() as { total: number }).total, 0);
  const past = await app.request("/api/activity?to=2000-01-01T00:00:00.000Z");
  assert.equal((await past.json() as { total: number }).total, 0);

  // Latest AI use is reported per connection.
  await db.insert(toolCalls).values({ tool: "list_databases", status: "success", args: null, databaseConnectionId: connectionId });
  const databases = await app.request("/api/databases");
  const list = await databases.json() as { id: string; lastUsedByAiAt: string | null }[];
  assert.ok(list.find((item) => item.id === connectionId)?.lastUsedByAiAt);
});
