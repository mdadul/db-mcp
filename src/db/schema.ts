import {
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const nowMs = sql`(unixepoch() * 1000)`;

export const databaseConnections = sqliteTable("database_connections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'postgresql'
  host: text("host").notNull(),
  port: integer("port").notNull(),
  databaseName: text("database_name").notNull(),
  username: text("username").notNull(),
  /** JSON-serialised EncryptedPayload — never returned to clients */
  encryptedCredentials: text("encrypted_credentials").notNull(),
  ssl: integer("ssl", { mode: "boolean" }).notNull().default(false),
  serviceName: text("service_name"),
  environment: text("environment"),
  status: text("status").notNull().default("enabled"), // 'enabled' | 'disabled'
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(nowMs),
});

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tool: text("tool").notNull(), // 'list_databases' | 'get_database_schema' | 'get_table_schema' | 'execute_read_query'
  databaseConnectionId: text("database_connection_id"),
  status: text("status").notNull().default("success"), // 'success' | 'error'
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(nowMs),
});

export const queryLogs = sqliteTable("query_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  databaseConnectionId: text("database_connection_id")
    .notNull()
    .references(() => databaseConnections.id, { onDelete: "cascade" }),
  toolName: text("tool_name"), // MCP tool name
  queryHash: text("query_hash"), // hash of query for privacy
  query: text("query").notNull(),
  executionTimeMs: integer("execution_time_ms"),
  rowCount: integer("row_count"),
  status: text("status").notNull(), // 'success' | 'error' | 'timeout' | 'blocked'
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(nowMs),
});
