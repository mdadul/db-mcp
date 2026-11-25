import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BrowseRowsQuerySchema, SchemaQuerySchema, TableSchemaQuerySchema, TestConnectionSchema } from "./types.ts";
import { quoteIdentifier } from "../../../query/identifiers.ts";
import { toJsonSafe } from "../../../query/jsonSafe.ts";
import type { DbEngineType } from "./types.ts";

test("quoteIdentifier escapes engine delimiters and treats names as single identifiers", () => {
  const cases: [string, DbEngineType, string][] = [
    ['x"; DROP TABLE t; --', "sqlite", '"x""; DROP TABLE t; --"'],
    ["x`; DROP TABLE t; --", "mysql", "`x``; DROP TABLE t; --`"],
    ["a.b", "postgresql", '"a.b"'],
    ["таблица", "redshift", '"таблица"'],
  ];
  for (const [value, engine, expected] of cases) assert.equal(quoteIdentifier(value, engine), expected);
  assert.throws(() => quoteIdentifier("", "sqlite"), /cannot be empty/);
});

test("workbench query schemas validate filters, pagination, sorting and direction", () => {
  assert.deepEqual(BrowseRowsQuerySchema.parse({}), { limit: 50, offset: 0, direction: "asc" });
  assert.deepEqual(BrowseRowsQuerySchema.parse({ limit: "12", offset: "3", orderBy: "id", direction: "desc" }), { limit: 12, offset: 3, orderBy: "id", direction: "desc" });
  for (const value of [{ limit: "0" }, { limit: "501" }, { offset: "-1" }, { direction: "sideways" }, { orderBy: "" }]) assert.equal(BrowseRowsQuerySchema.safeParse(value).success, false);
  assert.equal(SchemaQuerySchema.safeParse({ filter: "x" }).success, true);
  assert.equal(TableSchemaQuerySchema.safeParse({ schema: "main" }).success, true);
  assert.equal(TestConnectionSchema.safeParse({ type: "sqlite", name: "x", databaseName: "/tmp/x" }).success, true);
  assert.equal(TestConnectionSchema.safeParse({ type: "postgresql", name: "x", host: "db", port: 5432, databaseName: "x", username: "u", password: "p" }).success, true);
  assert.equal(TestConnectionSchema.safeParse({ type: "postgresql", name: "x", databaseName: "x", username: "u", password: "p" }).success, false);
});

test("row serialization converts values that JSON cannot faithfully represent", async () => {
  const { ObjectId } = await import("mongodb");
  assert.deepEqual(toJsonSafe({ count: 10n, created: new Date("2024-01-02T03:04:05.000Z"), binary: Buffer.from([1, 2]), id: new ObjectId("507f1f77bcf86cd799439011") }), {
    count: "10", created: "2024-01-02T03:04:05.000Z", binary: "<binary 2 bytes>", id: "507f1f77bcf86cd799439011",
  });
});

test("SQLite workbench endpoints inspect, page, sort, reject unknown columns, and audit app queries", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "db-mcp-workbench-"));
  const controlPath = join(directory, "control.sqlite");
  const externalPath = join(directory, "external.sqlite");
  process.env.DATABASE_PATH = controlPath;
  process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const Database = (await import("better-sqlite3")).default;
  const external = new Database(externalPath);
  external.exec("CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER); INSERT INTO people (name, age) VALUES ('Ada', 36), ('Linus', 54), ('Grace', 85);");
  external.close();

  const { runMigrations } = await import("../../../db/runMigrations.ts");
  await runMigrations();
  const { app } = await import("../../../app.ts");
  const { closeAll } = await import("../../../services/connPool.ts");
  const { closeDb, db } = await import("../../../db/client.ts");
  const { queryLogs } = await import("../../../db/schema.ts");
  t.after(async () => {
    await closeAll();
    closeDb();
    await rm(directory, { recursive: true, force: true });
    delete process.env.DATABASE_PATH;
    delete process.env.ENCRYPTION_KEY;
  });

  const create = await app.request("/api/databases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "SQLite sample", type: "sqlite", databaseName: externalPath, password: "unused" }),
  });
  assert.equal(create.status, 201);
  const connection = await create.json() as { id: string };

  const unsavedTest = await app.request("/api/databases/test", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "sqlite", name: "Temporary test", databaseName: externalPath, password: "unused" }),
  });
  const testResult = await unsavedTest.json() as { success: boolean; serverVersion?: string };
  assert.equal(unsavedTest.status, 200);
  assert.equal(testResult.success, true);
  assert.ok(testResult.serverVersion);
  const savedTest = await app.request(`/api/databases/${connection.id}/test`, { method: "POST" });
  assert.equal((await savedTest.json() as { success: boolean }).success, true);
  const testWithStoredPassword = await app.request("/api/databases/test", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: connection.id, type: "sqlite", name: "SQLite sample", databaseName: externalPath, password: "" }),
  });
  assert.equal((await testWithStoredPassword.json() as { success: boolean }).success, true);

  const duplicate = await app.request(`/api/databases/${connection.id}/duplicate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const duplicateConnection = await duplicate.json() as { id: string; name: string };
  assert.equal(duplicate.status, 201);
  assert.notEqual(duplicateConnection.id, connection.id);
  assert.equal(duplicateConnection.name, "SQLite sample (copy)");
  const duplicateAgain = await app.request(`/api/databases/${connection.id}/duplicate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal((await duplicateAgain.json() as { name: string }).name, "SQLite sample (copy 2)");
  const duplicateWithName = await app.request(`/api/databases/${connection.id}/duplicate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Named connection" }) });
  assert.equal((await duplicateWithName.json() as { name: string }).name, "Named connection");
  const namedDuplicate = await app.request(`/api/databases/${connection.id}/duplicate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Custom copy" }) });
  assert.equal((await namedDuplicate.json() as { name: string }).name, "Custom copy");
  const connectionStringResponse = await app.request(`/api/databases/${connection.id}/connection-string`);
  assert.equal((await connectionStringResponse.json() as { url: string }).url, `sqlite:${externalPath}`);

  const cachedQuery = await app.request(`/api/databases/${connection.id}/tables/people/rows?limit=1`);
  assert.equal(cachedQuery.status, 200);
  const externalForChange = new Database(externalPath);
  externalForChange.exec("ALTER TABLE people ADD COLUMN note TEXT DEFAULT 'x';");
  externalForChange.close();
  assert.equal((await app.request(`/api/databases/${connection.id}/test`, { method: "POST" })).status, 200);
  const refreshedStructure = await app.request(`/api/databases/${connection.id}/tables/people/schema`);
  assert.equal(((await refreshedStructure.json() as { columns: { name: string }[] }).columns.some((column) => column.name === "note")), true);

  const schemaResponse = await app.request(`/api/databases/${connection.id}/schema`);
  assert.deepEqual(await schemaResponse.json(), { engine: "sqlite", schemas: [{ name: "main", tables: [{ name: "people", type: "table", rowEstimate: null }] }] });

  const structureResponse = await app.request(`/api/databases/${connection.id}/tables/people/schema`);
  const structure = await structureResponse.json() as { columns: { name: string; isPrimaryKey: boolean }[] };
  assert.equal(structure.columns.find((column) => column.name === "id")?.isPrimaryKey, true);
  assert.equal(structure.columns.find((column) => column.name === "name")?.name, "name");

  const firstPage = await app.request(`/api/databases/${connection.id}/tables/people/rows?limit=2&offset=0&orderBy=name&direction=asc`);
  const first = await firstPage.json() as { rows: { name: string }[]; hasMore: boolean };
  assert.deepEqual(first.rows.map((row) => row.name), ["Ada", "Grace"]);
  assert.equal(first.hasMore, true);
  assert.equal((await app.request(`/api/databases/${connection.id}/tables/people/rows?schema=missing`)).status, 404);
  const rowsLog = await db.select().from(queryLogs);
  assert.ok(rowsLog.some((entry) => entry.source === "app" && entry.query.includes("ORDER BY \"name\" ASC")));
  const secondPage = await app.request(`/api/databases/${connection.id}/tables/people/rows?limit=2&offset=2&orderBy=name&direction=asc`);
  const second = await secondPage.json() as { rows: { name: string }[]; hasMore: boolean };
  assert.deepEqual(second.rows.map((row) => row.name), ["Linus"]);
  assert.equal(second.hasMore, false);

  const invalidOrder = await app.request(`/api/databases/${connection.id}/tables/people/rows?orderBy=name%22%3B%20DROP%20TABLE%20people`);
  assert.equal(invalidOrder.status, 400);
  assert.match((await invalidOrder.json() as { hint: string }).hint, /orderBy/);

  const invalidPort = await app.request(`/api/databases/${connection.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ port: 70000 }),
  });
  assert.equal(invalidPort.status, 400);
  assert.match((await invalidPort.json() as { error: string }).error, /^Invalid request: port: /);

  // Save a copied connection the way the edit form does: no password, empty optional strings.
  const copySave = await app.request(`/api/databases/${duplicateConnection.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "SQLite sample (copy)", type: "sqlite", host: "", port: 0, databaseName: externalPath, username: "", ssl: false, serviceName: "", environment: "" }),
  });
  assert.equal(copySave.status, 200);

  const query = await app.request(`/api/databases/${connection.id}/query`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "SELECT id, name FROM people ORDER BY id", limit: 2 }),
  });
  const result = await query.json() as { success: boolean; rows: { name: string }[]; columns: { name: string }[]; truncated: boolean };
  assert.equal(result.success, true);
  assert.deepEqual(result.columns.map((column) => column.name), ["id", "name"]);
  assert.equal(result.rows.length, 2);

  const blocked = await app.request(`/api/databases/${connection.id}/query`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "DELETE FROM people" }),
  });
  assert.equal(blocked.status, 200);
  const blockedResult = await blocked.json() as { success: boolean; hint: string };
  assert.equal(blockedResult.success, false);
  assert.match(blockedResult.hint, /Only SELECT/);
  const invalidSql = await app.request(`/api/databases/${connection.id}/query`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "SELECT FROM" }),
  });
  assert.match((await invalidSql.json() as { hint: string }).hint, /syntax/i);
  const logs = await db.select().from(queryLogs);
  assert.equal(logs.findLast((entry) => entry.query.includes("SELECT id, name FROM people"))?.source, "app");
  assert.equal(logs.findLast((entry) => entry.query === "DELETE FROM people")?.status, "blocked");
  const appActivity = await app.request("/api/activity?source=app&limit=100");
  const appActivityItems = (await appActivity.json() as { items: { source: string }[] }).items;
  assert.ok(appActivityItems.length > 0);
  assert.ok(appActivityItems.every((item) => item.source === "app"));
  const stats = await app.request("/api/stats");
  assert.equal((await stats.json() as { queries: { total: number } }).queries.total, 0);
});
