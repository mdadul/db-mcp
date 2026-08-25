import { eq, desc } from "drizzle-orm";
import { db } from "../../../db/client.ts";
import { databaseConnections, queryLogs } from "../../../db/schema.ts";
import { encrypt } from "../../../services/credentials.ts";
import {
  getExecutor,
  removeConnection,
} from "../../../services/connPool.ts";
import {
  assertReadOnly,
  injectLimit,
  MAX_ROWS,
  QUERY_TIMEOUT_MS,
} from "../../../query/safety.ts";
import { NotFoundError, BadRequestError } from "../../../errors.ts";
import { getDatabaseSchema as fetchDbSchema } from "../../../mcp/tools/getDatabaseSchema.ts";
import { getTableSchema as fetchTableSchema } from "../../../mcp/tools/getTableSchema.ts";
import type {
  CreateDatabaseInput,
  UpdateDatabaseInput,
  DatabaseConnection,
  TestResult,
  StructuredQueryResult,
  QueryLogItem,
  DbEngineType,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type Row = typeof databaseConnections.$inferSelect;

/** Strip credentials and convert Date → ISO string for the API response. */
function sanitize(row: Row): DatabaseConnection {
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
    status: row.status,
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
  return rows.map(sanitize);
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

export async function testConnection(id: string): Promise<TestResult> {
  const row = await findOrThrow(id);
  const start = Date.now();
  try {
    console.log(`[TEST] Starting connection test for database: ${row.name}`);
    const executor = await getExecutor(row.id, row as any);
    console.log(`[TEST] Got executor for ${row.type}, attempting query...`);
    
    await executor.query("SELECT 1");
    
    const latencyMs = Date.now() - start;
    console.log(`[TEST] Connection successful in ${latencyMs}ms`);
    return { success: true, message: `Connection successful (${latencyMs}ms)`, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    console.error(`[TEST] Connection failed after ${latencyMs}ms:`, err);
    
    // Extract error details across drivers; check both code and message
    const code = err?.code || err?.cause?.code || (err?.message?.match(/\b(E[A-Z]+)\b/)?.[1] ?? "");
    const rawMsg = err?.message || String(err) || "Unknown connection error";
    console.error(`[TEST] Error code: "${code}", message: "${rawMsg}"`);

    // Build user-friendly hint based on error code
    const errorHints: Record<string, string> = {
      "ECONNREFUSED": "Check that the host and port are correct and the database is running. Inside Docker, use the service name (e.g. postgres) or host.docker.internal to reach your host machine.",
      "ENOTFOUND": "Hostname could not be resolved. For cloud databases (Supabase, Neon, etc.) ensure you're using an IPv4-compatible URL — Supabase users: go to Settings → Database → Connection Pooling and copy the Session Pooler URL.",
      "ETIMEDOUT": "The host is reachable but not responding. Verify your credentials and that the database allows remote connections from this server.",
      "ENETUNREACH": "The hostname resolved to an IPv6 address that this server cannot route to. For Supabase, use the Session Pooler URL from your dashboard (Settings → Database → Connection Pooling) which supports IPv4.",
      "EACCES": "Access denied — check your username and password.",
      "ER_ACCESS_DENIED_ERROR": "Access denied — invalid username or password for this MySQL user.",
      "ER_BAD_DB_ERROR": "Database not found — verify the database name exists on this server.",
    };

    const hint = errorHints[code];
    const message = rawMsg.replace(/password=['"][^'"]*['"]/gi, "password=***");
    
    return { success: false, message, ...(hint ? { hint } : {}) };
  }
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

export async function getDatabaseSchemaApi(id: string): Promise<unknown> {
  const raw = await fetchDbSchema(id);
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

export async function getTableSchemaApi(
  id: string,
  tableName: string
): Promise<unknown> {
  const raw = await fetchTableSchema(id, tableName);
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

// ---------------------------------------------------------------------------
// Interactive Structured Query Execution
// ---------------------------------------------------------------------------

export async function executeQueryStructured(
  id: string,
  query: string,
  limit?: number
): Promise<StructuredQueryResult> {
  const row = await findOrThrow(id);
  if (row.status !== "enabled") {
    throw new BadRequestError(`Database "${row.name}" is disabled`);
  }

  assertReadOnly(query, row.type as DbEngineType);

  const finalQuery = injectLimit(query, limit ?? MAX_ROWS, row.type as DbEngineType);
  const executor = await getExecutor(row.id, row as any);

  const start = Date.now();
  let status: "success" | "error" = "success";
  let error: string | null = null;
  let rows: Record<string, unknown>[] = [];
  let columns: string[] = [];

  try {
    const rawRows = await Promise.race([
      executor.query<Record<string, unknown>>(finalQuery),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`Query timed out after ${QUERY_TIMEOUT_MS / 1000}s`)
            ),
          QUERY_TIMEOUT_MS
        )
      ),
    ]);

    rows = Array.isArray(rawRows) ? rawRows : [];
    if (rows.length > 0) {
      columns = Object.keys(rows[0]!);
    }
  } catch (err) {
    status = "error";
    error = err instanceof Error ? err.message : String(err);
  }

  const executionTimeMs = Date.now() - start;

  // Audit log
  db.insert(queryLogs)
    .values({
      databaseConnectionId: row.id,
      query: finalQuery,
      executionTimeMs,
      rowCount: status === "success" ? rows.length : null,
      status,
      error,
    })
    .catch(() => {});

  return {
    success: status === "success",
    executionTimeMs,
    rowCount: rows.length,
    columns,
    rows,
    error,
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
  const isTruncated = res.rowCount === effectiveLimit;
  return JSON.stringify({
    row_count: res.rowCount,
    truncated: isTruncated,
    columns: res.columns,
    rows: res.rows,
    hint: isTruncated
      ? `Results capped at ${effectiveLimit} rows. Pass a higher 'limit' (max 1000) or add WHERE/LIMIT to your query.`
      : `Query returned ${res.rowCount} row(s). Use get_table_schema to explore table structure.`,
  });
}

