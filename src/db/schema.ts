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
  args: text("args"), // JSON-serialised, credential-redacted tool arguments
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
  source: text("source").notNull().default("mcp"), // 'mcp' | 'app' | 'agent'
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(nowMs),
});

export const aiProviders = sqliteTable("ai_providers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  kind: text("kind").notNull(), // 'anthropic' | 'openai' | 'openai-compatible'
  name: text("name").notNull(),
  baseUrl: text("base_url"),
  /** JSON-serialised EncryptedPayload — never returned to clients */
  encryptedApiKey: text("encrypted_api_key"),
  defaultModel: text("default_model").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
});

export const analystThreads = sqliteTable("analyst_threads", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  providerId: text("provider_id").notNull().references(() => aiProviders.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  databaseId: text("database_id").references(() => databaseConnections.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
});

export const analystMessages = sqliteTable("analyst_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  threadId: text("thread_id").notNull().references(() => analystThreads.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant' | 'tool'
  content: text("content").notNull(), // JSON-serialised message parts
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  usage: text("usage"), // JSON token usage, nullable
});

export const analystArtifacts = sqliteTable("analyst_artifacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  threadId: text("thread_id").notNull().references(() => analystThreads.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
  kind: text("kind").notNull(), // 'chart' | 'table'
  title: text("title").notNull(),
  resultId: text("result_id").notNull(),
  spec: text("spec").notNull(), // JSON chart spec or selected table columns
  snapshot: text("snapshot").notNull(), // JSON-safe columns and rows, capped at 5 MB / 5,000 rows
  truncated: integer("truncated", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
});
