import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../../db/client.ts";
import { databaseConnections, queryLogs, toolCalls } from "../../../db/schema.ts";
import { decrypt, encrypt } from "../../../services/credentials.ts";
import {
  getExecutor,
  removeConnection,
} from "../../../services/connPool.ts";
import { createExecutor, type DbConfig } from "../../../services/dbExecutor.ts";
import { quoteIdentifier } from "../../../query/identifiers.ts";
import { toJsonSafe } from "../../../query/jsonSafe.ts";
import { sanitizeQuery, sanitizeToolArgs } from "../../../db/logToolCall.ts";
import {
  assertReadOnly,
  injectLimit,
  MAX_ROWS,
  QUERY_TIMEOUT_MS,
} from "../../../query/safety.ts";
import { NotFoundError, BadRequestError } from "../../../errors.ts";
import { DB_ENGINE_TYPES } from "./types.ts";
import type {
  CreateDatabaseInput,
  UpdateDatabaseInput,
  DatabaseConnection,
  TestResult,
  StructuredQueryResult,
  QueryLogItem,
  DbEngineType,
  SchemaTree,
  TableStructure,
  BrowseRowsInput,
  BrowseRowsResult,
  TestConnectionInput,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type Row = typeof databaseConnections.$inferSelect;

function dbConfig(row: Row): DbConfig {
  if (!(DB_ENGINE_TYPES as readonly string[]).includes(row.type)) {
    throw new BadRequestError(`Unsupported database engine "${row.type}"`);
  }
  return { ...row, type: row.type as DbEngineType };
}

/** Strip credentials and convert Date → ISO string for the API response. */
function sanitize(row: Row, lastUsedByAi: Date | null = null): DatabaseConnection {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    host: row.host,
    port: row.port,
    databaseName: row.databaseName,
    username: row.username,
    ssl: row.ssl,
    serviceName: row.serviceName,
    environment: row.environment,
    folder: row.folder,
    description: row.description,
    favourite: row.favourite,
    status: row.status,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestStatus: row.lastTestStatus === "reachable" || row.lastTestStatus === "unreachable" ? row.lastTestStatus : null,
    lastTestMessage: row.lastTestMessage,
    lastTestLatencyMs: row.lastTestLatencyMs,
    serverVersion: row.serverVersion,
    lastUsedByAiAt: lastUsedByAi?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Sanitize a driver error so credentials are never leaked. */
function sanitizeError(err: unknown): string {
  // Handle empty errors
  if (!err) return "Unknown error occurred";
  
  const msg = err instanceof Error ? err.message : String(err);
  
  // Return empty string check
  if (!msg || msg.trim() === "") {
    // Try to extract error code or type info
    if (err instanceof Error && (err as any).code) {
      const code = (err as any).code as string;
      const hints: Record<string, string> = {
        "ECONNREFUSED": "Connection refused - host or port is unreachable",
        "ENOTFOUND": "Host not found - check hostname spelling",
        "ETIMEDOUT": "Connection timeout - network is slow or host is down",
        "EACCES": "Access denied - check credentials",
        "ER_ACCESS_DENIED_ERROR": "Access denied - invalid username or password",
        "ER_BAD_DB_ERROR": "Database not found - check database name",
        "ER_NO_TABLES_USED": "Query error - invalid SQL",
      };
      return hints[code] || `Connection error (${code})`;
    }
    return "Connection failed - no additional error details available";
  }
  
  return msg.replace(/password=['"][^'"]*['"]/gi, "password=***");
}

async function findOrThrow(id: string): Promise<Row> {
  const [row] = await db
    .select()
    .from(databaseConnections)
    .where(eq(databaseConnections.id, id));
  if (!row) throw new NotFoundError("Database", id);
  return row;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listDatabases(): Promise<DatabaseConnection[]> {
  const rows = await db
    .select()
    .from(databaseConnections)
    .orderBy(databaseConnections.createdAt);
  const lastUsed = await lastAiUseByConnection();
  return rows.map((row) => sanitize(row, lastUsed.get(row.id) ?? null));
}

/** Latest MCP query or tool call per connection. App queries do not count as AI use. */
async function lastAiUseByConnection(): Promise<Map<string, Date>> {
  const [queryUse, toolUse] = await Promise.all([
    db
      .select({ id: queryLogs.databaseConnectionId, last: sql<number | null>`max(${queryLogs.createdAt})` })
      .from(queryLogs)
      .where(eq(queryLogs.source, "mcp"))
      .groupBy(queryLogs.databaseConnectionId),
    db
      .select({ id: toolCalls.databaseConnectionId, last: sql<number | null>`max(${toolCalls.createdAt})` })
      .from(toolCalls)
      .groupBy(toolCalls.databaseConnectionId),
  ]);
  const result = new Map<string, Date>();
  for (const entry of [...queryUse, ...toolUse]) {
    if (!entry.id || entry.last === null || entry.last === undefined) continue;
    const at = new Date(Number(entry.last));
    const current = result.get(entry.id);
    if (!current || at > current) result.set(entry.id, at);
  }
  return result;
}

export async function getDatabase(id: string): Promise<DatabaseConnection> {
  return sanitize(await findOrThrow(id));
}

export async function createDatabase(
  input: CreateDatabaseInput
): Promise<DatabaseConnection> {
  const encryptedCredentials = JSON.stringify(await encrypt(input.password));

  const [row] = await db
    .insert(databaseConnections)
    .values({
      name: input.name,
      type: input.type,
      host: input.host,
      port: input.port,
      databaseName: input.databaseName,
      username: input.username,
      encryptedCredentials,
      ssl: input.ssl,
      serviceName: input.serviceName ?? null,
      environment: input.environment ?? null,
      folder: input.folder || null,
      description: input.description || null,
    })
    .returning();

  return sanitize(row!);
}

export async function updateDatabase(
  id: string,
  input: UpdateDatabaseInput
): Promise<DatabaseConnection> {
  await findOrThrow(id); // 404 if not found

  const updates: Partial<typeof databaseConnections.$inferInsert> = {};

  if (input.name !== undefined) updates.name = input.name;
  if (input.host !== undefined) updates.host = input.host;
  if (input.port !== undefined) updates.port = input.port;
  if (input.databaseName !== undefined)
    updates.databaseName = input.databaseName;
  if (input.username !== undefined) updates.username = input.username;
  if (input.ssl !== undefined) updates.ssl = input.ssl;
  if (input.serviceName !== undefined)
    updates.serviceName = input.serviceName ?? null;
  if (input.environment !== undefined)
    updates.environment = input.environment ?? null;
  if (input.folder !== undefined) updates.folder = input.folder || null;
  if (input.description !== undefined) updates.description = input.description || null;
  if (input.favourite !== undefined) updates.favourite = input.favourite;
  if (input.password !== undefined) {
    updates.encryptedCredentials = JSON.stringify(
      await encrypt(input.password)
    );
  }

  // Invalidate the cached pool whenever any connection-relevant field changes
  const connectionFieldChanged =
    input.host !== undefined ||
    input.port !== undefined ||
    input.databaseName !== undefined ||
    input.username !== undefined ||
    input.ssl !== undefined ||
    input.password !== undefined;
  if (connectionFieldChanged) {
    removeConnection(id);
  }

  updates.updatedAt = new Date();

  const [row] = await db
    .update(databaseConnections)
    .set(updates)
    .where(eq(databaseConnections.id, id))
    .returning();

  return sanitize(row!);
}

export async function deleteDatabase(id: string): Promise<void> {
  await findOrThrow(id); // 404 if not found
  removeConnection(id);
  await db
    .delete(databaseConnections)
    .where(eq(databaseConnections.id, id));
}

export async function testConnection(id: string): Promise<TestResult & { code?: string; serverVersion?: string }> {
  const row = await findOrThrow(id);
  const result = await testConnectionConfig(dbConfig(row));
  removeConnection(id);
  await db
    .update(databaseConnections)
    .set({
      lastTestedAt: new Date(),
      lastTestStatus: result.success ? "reachable" : "unreachable",
      lastTestMessage: result.success ? null : result.message,
      lastTestLatencyMs: result.latencyMs ?? null,
      serverVersion: result.serverVersion ?? row.serverVersion,
    })
    .where(eq(databaseConnections.id, id));
  return result;
}

const TEST_CONNECTION_TIMEOUT_MS = 10_000;

async function testConnectionConfig(config: DbConfig): Promise<TestResult & { code?: string; serverVersion?: string }> {
  const startedAt = Date.now();
  let executor: Awaited<ReturnType<typeof createExecutor>> | undefined;
  try {
    const connecting = createExecutor(config);
    executor = await withTimeout(connecting, TEST_CONNECTION_TIMEOUT_MS, "DB_MCP_TEST_TIMEOUT").catch((error: unknown) => {
      void connecting.then((lateExecutor) => lateExecutor.close().catch(() => undefined), () => undefined);
      throw error;
    });
    const probe = config.type === "mongodb" ? JSON.stringify({ op: "ping" }) : "SELECT 1";
    const remaining = Math.max(1, TEST_CONNECTION_TIMEOUT_MS - (Date.now() - startedAt));
    await withTimeout(executor.query(probe), remaining, "DB_MCP_TEST_TIMEOUT");
    const versionBudget = Math.max(1, Math.min(1_500, TEST_CONNECTION_TIMEOUT_MS - (Date.now() - startedAt)));
    const serverVersion = await withTimeout(readServerVersion(executor, config.type), versionBudget, "DB_MCP_VERSION_TIMEOUT").catch(() => undefined);
    return { success: true, message: `Connection successful (${Date.now() - startedAt}ms)`, latencyMs: Date.now() - startedAt, ...(serverVersion ? { serverVersion } : {}) };
  } catch (error) {
    const code = extractErrorCode(error);
    console.error(`[TEST] Connection failed (${code || "unknown"})`);
    return {
      success: false,
      message: isTimeout(error) ? "Connection test timed out" : sanitizeError(error),
      latencyMs: Date.now() - startedAt,
      hint: connectionErrorHint(code, error),
      ...(code ? { code } : {}),
    };
  } finally {
    if (executor) await executor.close().catch(() => undefined);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "";
  const coded = error as Error & { code?: string; cause?: { code?: string } };
  if (coded.code) return coded.code;
  if (coded.cause?.code) return coded.cause.code;
  return error.message.match(/\b(E[A-Z0-9_]+|28P01)\b/)?.[1] ?? "";
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.message.includes("TIMEOUT") || error.message.toLowerCase().includes("timeout"));
}

function connectionErrorHint(code: string, error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (isTimeout(error) || code === "ETIMEDOUT") return "Connection timed out. Check host, port, firewall, VPN, and whether the database accepts remote connections.";
  if (code === "ECONNREFUSED") return "Check that the host and port are correct, the database is running, and firewall or VPN rules allow the connection.";
  if (code === "ENOTFOUND") return "Hostname could not be resolved. Check the hostname and network/VPN settings.";
  if (code === "ENETUNREACH") return "The host is not reachable over the current network. Check VPN and firewall settings.";
  if (code === "28P01" || code === "ER_ACCESS_DENIED_ERROR" || /authentication failed|password authentication/i.test(message)) return "Authentication failed. Check the username and password.";
  if (code === "ER_BAD_DB_ERROR" || code === "3D000" || /database .* does not exist|unknown database/i.test(message)) return "Database was not found. Check the database name and permissions.";
  if (/certificate|self[ -]signed|ssl|tls/i.test(message)) return "SSL/TLS negotiation failed. Check the SSL setting and certificate requirements for this server.";
  return "Check the connection settings, credentials, SSL requirements, and network access.";
}

async function readServerVersion(executor: Awaited<ReturnType<typeof createExecutor>>, type: DbEngineType): Promise<string | undefined> {
  if (type === "mongodb") {
    const result = await executor.query<{ version?: string }>(JSON.stringify({ op: "buildInfo" }));
    return result[0]?.version;
  }
  const result = await executor.query<Record<string, unknown>>(type === "sqlite" ? "SELECT sqlite_version() AS version" : "SELECT version() AS version");
  const value = result[0]?.version;
  return value == null ? undefined : String(value);
}

export async function testConnectionInput(input: TestConnectionInput): Promise<TestResult & { code?: string; serverVersion?: string }> {
  let password = input.password;
  if (input.id && !password) password = await decrypt(JSON.parse((await findOrThrow(input.id)).encryptedCredentials));
  const encryptedCredentials = JSON.stringify(await encrypt(password));
  return testConnectionConfig({
    type: input.type,
    host: input.host,
    port: input.port,
    databaseName: input.databaseName,
    username: input.username,
    encryptedCredentials,
    ssl: input.ssl,
  });
}

export async function duplicateDatabase(id: string, input: { name?: string }): Promise<DatabaseConnection> {
  const original = await findOrThrow(id);
  const baseName = input.name?.trim() || `${original.name} (copy)`;
  const copyStem = input.name?.trim() || original.name;
  let name = baseName;
  let suffix = 2;
  while (await db.select({ id: databaseConnections.id }).from(databaseConnections).where(eq(databaseConnections.name, name)).then((matches) => matches.length > 0)) {
    name = `${copyStem} (copy ${suffix++})`;
  }
  const [created] = await db.insert(databaseConnections).values({
    name,
    type: original.type,
    host: original.host,
    port: original.port,
    databaseName: original.databaseName,
    username: original.username,
    encryptedCredentials: original.encryptedCredentials,
    ssl: original.ssl,
    serviceName: original.serviceName,
    environment: original.environment,
    status: original.status,
  }).returning();
  return sanitize(created!);
}

export async function getConnectionString(id: string): Promise<{ url: string }> {
  const row = await findOrThrow(id);
  const user = encodeURIComponent(row.username);
  const auth = user ? `${user}:****@` : "";
  const query = new URLSearchParams();
  if (row.ssl && row.type === "mysql") query.set("ssl", "true");
  if (row.ssl && row.type === "mongodb") query.set("tls", "true");
  if (row.ssl && (row.type === "postgresql" || row.type === "redshift")) query.set("sslmode", "require");
  const suffix = query.size ? `?${query.toString()}` : "";
  let url: string;
  switch (row.type as DbEngineType) {
    case "sqlite": url = row.databaseName === ":memory:" ? "sqlite::memory:" : `sqlite:${row.databaseName}`; break;
    case "mysql": url = `mysql://${auth}${row.host}:${row.port}/${encodeURIComponent(row.databaseName)}${suffix}`; break;
    case "mongodb": url = `mongodb://${auth}${row.host}:${row.port}/${encodeURIComponent(row.databaseName)}${suffix}`; break;
    case "redshift":
    case "postgresql": url = `postgresql://${auth}${row.host}:${row.port}/${encodeURIComponent(row.databaseName)}${suffix}`; break;
    default: { const exhaustive: never = row.type as never; throw new Error(`Unsupported database engine: ${exhaustive}`); }
  }
  return { url };
}

export async function setStatus(
  id: string,
  status: "enabled" | "disabled"
): Promise<DatabaseConnection> {
  await findOrThrow(id); // 404 if not found

  const [row] = await db
    .update(databaseConnections)
    .set({ status, updatedAt: new Date() })
    .where(eq(databaseConnections.id, id))
    .returning();

  return sanitize(row!);
}

// ---------------------------------------------------------------------------
// Schema Inspection API
// ---------------------------------------------------------------------------

type MetadataRow = Record<string, unknown>;

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => toJsonSafe(row) as T);
}

async function getEnabledExecutor(id: string): Promise<{ row: Row; executor: Awaited<ReturnType<typeof getExecutor>> }> {
  const row = await findOrThrow(id);
  if (row.status !== "enabled") throw new BadRequestError(`Database "${row.name}" is disabled`, "Enable the connection before browsing or querying it.");
  return { row, executor: await getExecutor(row.id, dbConfig(row)) };
}

export async function getDatabaseSchemaApi(id: string, filter?: string): Promise<SchemaTree> {
  const { row, executor } = await getEnabledExecutor(id);
  let schemas: SchemaTree["schemas"];
  switch (row.type as DbEngineType) {
    case "sqlite": {
      const tables = await executor.query<MetadataRow>("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
      schemas = [{ name: "main", tables: tables.map((table) => ({ name: String(table.name), type: table.type === "view" ? "view" as const : "table" as const, rowEstimate: null })) }];
      break;
    }
    case "mysql": {
      const tables = await executor.query<MetadataRow>("SELECT TABLE_NAME AS table_name, TABLE_TYPE AS table_type, TABLE_ROWS AS row_estimate FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME", [row.databaseName]);
      schemas = [{ name: row.databaseName, tables: tables.map((table) => ({ name: String(table.table_name), type: String(table.table_type).toUpperCase() === "VIEW" ? "view" as const : "table" as const, rowEstimate: safeNumber(table.row_estimate) })) }];
      break;
    }
    case "mongodb": {
      const collections = await executor.query<MetadataRow>(JSON.stringify({ op: "listCollections" }));
      schemas = [{ name: row.databaseName, tables: collections.map((collection) => ({ name: String(collection.table_name), type: "collection" as const, rowEstimate: safeNumber(collection.row_estimate) })) }];
      break;
    }
    case "redshift": {
      const tables = await executor.query<MetadataRow>("SELECT t.table_schema AS schema_name, t.table_name, CASE WHEN t.table_type = 'VIEW' THEN 'view' ELSE 'table' END AS table_type, i.tbl_rows AS row_estimate FROM information_schema.tables t LEFT JOIN SVV_TABLE_INFO i ON i.schema = t.table_schema AND i.\"table\" = t.table_name WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND t.table_type IN ('BASE TABLE', 'VIEW') ORDER BY t.table_schema, t.table_name");
      schemas = groupSchemaTables(tables);
      break;
    }
    case "postgresql": {
      const tables = await executor.query<MetadataRow>("SELECT n.nspname AS schema_name, c.relname AS table_name, CASE WHEN c.relkind IN ('v','m') THEN 'view' ELSE 'table' END AS table_type, c.reltuples AS row_estimate FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') ORDER BY n.nspname, c.relname");
      schemas = groupSchemaTables(tables);
      break;
    }
    default: {
      const exhaustive: never = row.type as never;
      throw new Error(`Unsupported database engine: ${exhaustive}`);
    }
  }
  if (filter) {
    const needle = filter.toLocaleLowerCase();
    schemas = schemas.map((schema) => ({ ...schema, tables: schema.tables.filter((table) => table.name.toLocaleLowerCase().includes(needle)) })).filter((schema) => schema.tables.length > 0);
  }
  return { engine: row.type as DbEngineType, schemas };
}

function groupSchemaTables(rows: MetadataRow[]): SchemaTree["schemas"] {
  const grouped = new Map<string, SchemaTree["schemas"][number]["tables"]>();
  for (const row of rows) {
    const schema = String(row.schema_name);
    const tables = grouped.get(schema) ?? [];
    tables.push({ name: String(row.table_name), type: String(row.table_type).toLowerCase() === "view" ? "view" : "table", rowEstimate: safeNumber(row.row_estimate) });
    grouped.set(schema, tables);
  }
  return [...grouped].map(([name, tables]) => ({ name, tables }));
}

export async function getTableSchemaApi(id: string, tableName: string, requestedSchema?: string): Promise<TableStructure> {
  const { row, executor } = await getEnabledExecutor(id);
  const engine = row.type as DbEngineType;
  const tree = await getDatabaseSchemaApi(id);
  const foundSchema = tree.schemas.find((candidate) => (!requestedSchema || candidate.name === requestedSchema) && candidate.tables.some((table) => table.name === tableName));
  if (!foundSchema) throw new NotFoundError("Table", tableName, "Choose a table from the database schema endpoint and verify the schema parameter.");
  const schema = requestedSchema ?? foundSchema.name;
  const tableMeta = foundSchema.tables.find((table) => table.name === tableName)!;
  if (engine === "mongodb") {
    const docs = await executor.query<Record<string, unknown>>(JSON.stringify({ op: "sampleWorkbench", collection: tableName, limit: 50 }));
    const types = new Map<string, Set<string>>();
    for (const doc of docs) for (const [name, value] of Object.entries(doc)) {
      const type = value === null ? "null" : Array.isArray(value) ? "array" : value instanceof Date ? "date" : typeof value === "object" ? (value?.constructor?.name ?? "object") : typeof value;
      const set = types.get(name) ?? new Set<string>(); set.add(type); types.set(name, set);
    }
    const rawIndexes = await executor.query<MetadataRow>(JSON.stringify({ op: "listIndexes", collection: tableName }));
    return { schema, name: tableName, type: "collection", rowEstimate: tableMeta.rowEstimate, columns: [...types].map(([name, values]) => ({ name, dataType: [...values].join(" | "), nullable: values.has("null"), default: null, isPrimaryKey: name === "_id", comment: null })), indexes: rawIndexes.map((index) => ({ name: String(index.index_name), columns: String(index.column_name).split(", ").filter(Boolean), unique: Boolean(index.is_unique), primary: Boolean(index.is_primary) })), foreignKeys: [] };
  }

  let columns: MetadataRow[] = [];
  let indexes: MetadataRow[] = [];
  let foreignKeys: MetadataRow[] = [];
  if (engine === "sqlite") {
    const [cols, idx, fk] = await Promise.all([
      executor.query<MetadataRow>(`PRAGMA ${quoteIdentifier(schema, engine)}.table_info(${quoteIdentifier(tableName, engine)})`),
      executor.query<MetadataRow>(`PRAGMA ${quoteIdentifier(schema, engine)}.index_list(${quoteIdentifier(tableName, engine)})`),
      executor.query<MetadataRow>(`PRAGMA ${quoteIdentifier(schema, engine)}.foreign_key_list(${quoteIdentifier(tableName, engine)})`),
    ]);
    columns = cols.map((column) => ({ name: column.name, data_type: column.type || "TEXT", nullable: !column.notnull && !column.pk, column_default: column.dflt_value ?? null, is_primary_key: Boolean(column.pk), comment: null }));
    for (const index of idx) {
      const indexColumns = await executor.query<MetadataRow>(`PRAGMA ${quoteIdentifier(schema, engine)}.index_info(${quoteIdentifier(String(index.name), engine)})`);
      indexes.push({ name: index.name, columns: indexColumns.map((item) => item.name), unique: Boolean(index.unique), primary: index.origin === "pk" });
    }
    foreignKeys = fk.map((item) => ({ name: `fk_${String(item.id)}`, columns: [item.from], ref_schema: schema, ref_table: item.table, ref_columns: [item.to] }));
  } else if (engine === "mysql") {
    [columns, indexes, foreignKeys] = await Promise.all([
      executor.query<MetadataRow>("SELECT c.COLUMN_NAME AS name, c.COLUMN_TYPE AS data_type, c.IS_NULLABLE AS nullable, c.COLUMN_DEFAULT AS column_default, c.COLUMN_KEY AS column_key, c.COLUMN_COMMENT AS comment FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ? ORDER BY c.ORDINAL_POSITION", [schema, tableName]),
      executor.query<MetadataRow>("SELECT INDEX_NAME AS name, COLUMN_NAME AS column_name, NON_UNIQUE AS non_unique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX", [schema, tableName]),
      executor.query<MetadataRow>("SELECT CONSTRAINT_NAME AS name, COLUMN_NAME AS column_name, REFERENCED_TABLE_SCHEMA AS ref_schema, REFERENCED_TABLE_NAME AS ref_table, REFERENCED_COLUMN_NAME AS ref_column FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION", [schema, tableName]),
    ]);
  } else if (engine === "redshift") {
    [columns, indexes] = await Promise.all([
      executor.query<MetadataRow>("SELECT column_name AS name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position", [schema, tableName]),
      executor.query<MetadataRow>("SELECT sortkey1 AS name, sortkey1 AS column_name, false AS is_unique, false AS is_primary FROM SVV_TABLE_INFO WHERE schema=$1 AND \"table\"=$2 AND sortkey1 IS NOT NULL", [schema, tableName]),
    ]);
  } else {
    [columns, indexes, foreignKeys] = await Promise.all([
      executor.query<MetadataRow>("SELECT c.column_name AS name, c.data_type, c.is_nullable, c.column_default, c.is_identity, pgd.description AS comment, EXISTS (SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema WHERE tc.constraint_type='PRIMARY KEY' AND kcu.table_schema=c.table_schema AND kcu.table_name=c.table_name AND kcu.column_name=c.column_name) AS is_primary_key FROM information_schema.columns c LEFT JOIN pg_catalog.pg_statio_all_tables st ON st.schemaname=c.table_schema AND st.relname=c.table_name LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid=st.relid AND pgd.objsubid=c.ordinal_position WHERE c.table_schema=$1 AND c.table_name=$2 ORDER BY c.ordinal_position", [schema, tableName]),
      executor.query<MetadataRow>("SELECT i.relname AS name, array_agg(a.attname ORDER BY x.ordinality) AS columns, ix.indisunique AS unique, ix.indisprimary AS primary FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_index ix ON t.oid=ix.indrelid JOIN pg_class i ON i.oid=ix.indexrelid JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality) ON true JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=x.attnum WHERE n.nspname=$1 AND t.relname=$2 GROUP BY i.relname, ix.indisunique, ix.indisprimary ORDER BY i.relname", [schema, tableName]),
      executor.query<MetadataRow>("SELECT tc.constraint_name AS name, array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns, ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, array_agg(ccu.column_name ORDER BY kcu.ordinal_position) AS ref_columns FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema=$1 AND tc.table_name=$2 GROUP BY tc.constraint_name, ccu.table_schema, ccu.table_name", [schema, tableName]),
    ]);
  }
  return {
    schema, name: tableName, type: tableMeta.type, rowEstimate: tableMeta.rowEstimate,
    columns: columns.map((column) => ({ name: String(column.name ?? column.column_name), dataType: String(column.data_type ?? "unknown"), nullable: typeof column.nullable === "boolean" ? column.nullable : String(column.is_nullable ?? column.nullable).toUpperCase() === "YES", default: column.column_default == null ? null : String(column.column_default), isPrimaryKey: Boolean(column.is_primary_key ?? column.column_key === "PRI"), comment: column.comment == null ? null : String(column.comment) })),
    indexes: groupMetadata(indexes, "name", "column_name", (items) => ({ unique: engine === "mysql" ? Number(items[0]?.non_unique) === 0 : Boolean(items[0]?.unique ?? items[0]?.is_unique), primary: engine === "mysql" ? items[0]?.name === "PRIMARY" : Boolean(items[0]?.primary ?? items[0]?.is_primary) })),
    foreignKeys: groupForeignKeys(foreignKeys),
  };
}

function groupMetadata(rows: MetadataRow[], nameKey: string, columnKey: string, flags: (items: MetadataRow[]) => { unique: boolean; primary: boolean }): TableStructure["indexes"] {
  const grouped = new Map<string, MetadataRow[]>();
  for (const row of rows) { const name = String(row[nameKey]); grouped.set(name, [...(grouped.get(name) ?? []), row]); }
  return [...grouped].map(([name, items]) => ({ name, columns: Array.isArray(items[0]?.columns) ? items[0]!.columns as string[] : items.map((item) => String(item[columnKey])), ...flags(items) }));
}

function groupForeignKeys(rows: MetadataRow[]): TableStructure["foreignKeys"] {
  const grouped = new Map<string, MetadataRow[]>();
  for (const row of rows) { const name = String(row.name ?? row.constraint_name ?? `fk_${row.id ?? "unknown"}`); grouped.set(name, [...(grouped.get(name) ?? []), row]); }
  return [...grouped].map(([name, items]) => ({ name, columns: Array.isArray(items[0]?.columns) ? items[0]!.columns as string[] : items.map((item) => String(item.column_name ?? item.from)), refSchema: items[0]?.ref_schema == null ? null : String(items[0].ref_schema), refTable: String(items[0]?.ref_table ?? items[0]?.foreign_table ?? items[0]?.table ?? ""), refColumns: Array.isArray(items[0]?.ref_columns) ? items[0]!.ref_columns as string[] : items.map((item) => String(item.ref_column ?? item.foreign_column ?? item.to)) }));
}

export async function browseTableRows(id: string, tableName: string, input: BrowseRowsInput): Promise<BrowseRowsResult> {
  const { row, executor } = await getEnabledExecutor(id);
  const structure = await getTableSchemaApi(id, tableName, input.schema);
  if (input.orderBy && !structure.columns.some((column) => column.name === input.orderBy)) throw new BadRequestError(`Unknown order column "${input.orderBy}"`, "Choose an orderBy column returned by the table schema endpoint.");
  const startedAt = Date.now();
  let rows: Record<string, unknown>[] = [];
  let auditQuery = "";
  try {
    if (row.type === "mongodb") {
      auditQuery = JSON.stringify({ op: "browse", collection: tableName, orderBy: input.orderBy, direction: input.direction, limit: input.limit + 1, offset: input.offset });
      rows = await executor.query<Record<string, unknown>>(auditQuery);
    } else {
      const table = row.type === "sqlite" ? quoteIdentifier(tableName, "sqlite") : `${quoteIdentifier(structure.schema, row.type as DbEngineType)}.${quoteIdentifier(tableName, row.type as DbEngineType)}`;
      const order = input.orderBy ? ` ORDER BY ${quoteIdentifier(input.orderBy, row.type as DbEngineType)} ${input.direction.toUpperCase()}` : "";
      auditQuery = `SELECT * FROM ${table}${order} LIMIT ${input.limit + 1} OFFSET ${input.offset}`;
      rows = await executor.query<Record<string, unknown>>(auditQuery);
    }
  } catch (error) {
    const executionTimeMs = Date.now() - startedAt;
    await db.insert(queryLogs).values({ databaseConnectionId: row.id, query: auditQuery, executionTimeMs, rowCount: null, status: "error", error: sanitizeError(error), source: "app" });
    throw new BadRequestError("Unable to browse table rows", "Check the selected table, schema, and database permissions.");
  }
  const executionTimeMs = Date.now() - startedAt;
  const hasMore = rows.length > input.limit;
  const visibleRows = normalizeRows(rows.slice(0, input.limit));
  const columns = structure.columns.map(({ name, dataType }) => ({ name, dataType }));
  await db.insert(queryLogs).values({ databaseConnectionId: row.id, query: auditQuery, executionTimeMs, rowCount: visibleRows.length, status: "success", source: "app" });
  return { columns, rows: visibleRows, limit: input.limit, offset: input.offset, hasMore, executionTimeMs };
}

// ---------------------------------------------------------------------------
// Interactive Structured Query Execution
// ---------------------------------------------------------------------------

export async function executeQueryStructured(
  id: string,
  query: string,
  limit?: number,
  source: "mcp" | "app" = "mcp"
): Promise<StructuredQueryResult> {
  const row = await findOrThrow(id);
  if (row.status !== "enabled") {
    throw new BadRequestError(`Database "${row.name}" is disabled`, "Enable the connection before querying it.");
  }

  try {
    assertReadOnly(query, row.type as DbEngineType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Only read-only queries are allowed";
    const hint = row.type === "mongodb"
      ? 'Use the read-only MongoDB JSON query shape: {"collection":"name","filter":{}}.'
      : "Only SELECT, EXPLAIN, SHOW, and DESCRIBE statements are allowed. Write operations are blocked.";
    await db.insert(queryLogs).values({ databaseConnectionId: row.id, query, executionTimeMs: 0, rowCount: null, status: "blocked", error: message, source });
    return { success: false, executionTimeMs: 0, rowCount: 0, columns: [], rows: [], error: message, truncated: false, hint };
  }

  const effectiveLimit = limit ?? MAX_ROWS;
  const requestedLimit = effectiveLimit + 1;
  const finalQuery = injectLimit(query, requestedLimit, row.type as DbEngineType).replace(/\bLIMIT\s+(\d+)\b/i, (_match, count: string) => `LIMIT ${Math.min(Number(count), requestedLimit)}`);
  const executor = await getExecutor(row.id, row as any);

  const start = Date.now();
  let status: "success" | "error" = "success";
  let error: string | null = null;
  let rows: Record<string, unknown>[] = [];
  let columns: { name: string }[] = [];
  let truncated = false;
  let hint: string | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const rawRows = await Promise.race([
      executor.query<Record<string, unknown>>(finalQuery),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(`Query timed out after ${QUERY_TIMEOUT_MS / 1000}s`)
            ),
          QUERY_TIMEOUT_MS
        );
      }),
    ]);

      const fetchedRows = Array.isArray(rawRows) ? normalizeRows(rawRows) : [];
      truncated = fetchedRows.length > effectiveLimit;
      rows = fetchedRows.slice(0, effectiveLimit);
    if (rows.length > 0) {
      columns = Object.keys(rows[0]!).map((name) => ({ name }));
    }
  } catch (err) {
    status = "error";
    error = err instanceof Error ? err.message : String(err);
    hint = error.toLowerCase().includes("timeout")
      ? "The query exceeded the execution time limit. Narrow the query with filters or a smaller result set."
      : /syntax|parse error|near .*error/i.test(error)
        ? "Check the SQL syntax for this database engine and try the query again."
        : "Check the referenced table and column names. Use the schema endpoints to inspect the database.";
  }
  if (timeout) clearTimeout(timeout);

  const executionTimeMs = Date.now() - start;

  // Audit log
  await db.insert(queryLogs)
    .values({
      databaseConnectionId: row.id,
      // Same redaction as tool-call args: literals can contain secrets.
      // MongoDB queries are JSON, so keep their structure and redact sensitive keys.
      query: row.type === "mongodb" ? (sanitizeToolArgs(finalQuery) ?? "") : sanitizeQuery(finalQuery),
      executionTimeMs,
      rowCount: status === "success" ? rows.length : null,
      status,
      error,
      source,
    })
    .catch((err) => console.error("Failed to persist query audit log", err instanceof Error ? err.message : "unknown error"));

  return {
    success: status === "success",
    executionTimeMs,
    rowCount: rows.length,
    columns,
    rows,
    error,
    truncated,
    hint: hint ?? (truncated ? `Results capped at ${effectiveLimit} rows. Add a WHERE clause or explicit LIMIT to narrow the results.` : null),
  };
}

// ---------------------------------------------------------------------------
// Audit Query Logs
// ---------------------------------------------------------------------------

export async function getDatabaseLogs(
  id: string,
  limit = 50
): Promise<QueryLogItem[]> {
  await findOrThrow(id);
  const rows = await db
    .select()
    .from(queryLogs)
    .where(eq(queryLogs.databaseConnectionId, id))
    .orderBy(desc(queryLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    databaseConnectionId: r.databaseConnectionId,
    query: r.query,
    executionTimeMs: r.executionTimeMs,
    rowCount: r.rowCount,
    status: r.status,
    error: r.error,
    source: r.source as "mcp" | "app",
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// MCP-facing text output query execution
// ---------------------------------------------------------------------------

export async function executeReadQuery(
  id: string,
  query: string,
  limit?: number
): Promise<string> {
  const row = await findOrThrow(id);

  // Validate read-only before hitting the DB
  try {
    assertReadOnly(query, row.type as DbEngineType);
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
      hint:
        row.type === "mongodb"
          ? 'MongoDB queries must be a JSON DSL: {"collection":"orders","filter":{},"projection":{},"sort":{},"limit":20}. Write/code-executing operators are blocked.'
          : "Only SELECT, EXPLAIN, SHOW, and DESCRIBE statements are allowed. Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are blocked.",
    });
  }

  const res = await executeQueryStructured(id, query, limit);
  if (!res.success) {
    return JSON.stringify({
      error: res.error,
      hint:
        row.type === "mongodb"
          ? "Check your collection name and filter syntax. Use get_table_schema to see inferred fields and indexes."
          : "Check your SQL syntax and column/table names. Use get_table_schema to verify the schema.",
    });
  }
  const effectiveLimit = limit ?? MAX_ROWS;
  const isTruncated = res.truncated;
  return JSON.stringify({
    row_count: res.rowCount,
    truncated: isTruncated,
    columns: res.columns.map((column) => column.name),
    rows: res.rows,
    hint: isTruncated
      ? `Results capped at ${effectiveLimit} rows. Pass a higher 'limit' (max 1000) or add WHERE/LIMIT to your query.`
      : `Query returned ${res.rowCount} row(s). Use get_table_schema to explore table structure.`,
  });
}
