import { z } from "zod";

// ---------------------------------------------------------------------------
// Engine type — single source of truth, shared by server and client
// ---------------------------------------------------------------------------

export const DB_ENGINE_TYPES = ["postgresql", "mysql", "sqlite", "redshift", "mongodb"] as const;
export type DbEngineType = (typeof DB_ENGINE_TYPES)[number];

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const CreateDatabaseSchema = z.discriminatedUnion("type", [
  z.object({
    name: z.string().min(1).max(255),
    type: z.literal("postgresql"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(5432),
    databaseName: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    ssl: z.boolean().default(false),
    serviceName: z.string().optional(),
    environment: z.string().optional(),
    folder: z.string().trim().max(100).optional(),
    description: z.string().max(500).optional(),
  }),
  z.object({
    name: z.string().min(1).max(255),
    type: z.literal("mysql"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(3306),
    databaseName: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    ssl: z.boolean().default(false),
    serviceName: z.string().optional(),
    environment: z.string().optional(),
    folder: z.string().trim().max(100).optional(),
    description: z.string().max(500).optional(),
  }),
  z.object({
    name: z.string().min(1).max(255),
    type: z.literal("sqlite"),
    databaseName: z.string().min(1), // file path or :memory:
    host: z.string().default(""),
    port: z.number().default(0),
    username: z.string().default(""),
    password: z.string().default(""),
    ssl: z.boolean().default(false),
    serviceName: z.string().optional(),
    environment: z.string().optional(),
    folder: z.string().trim().max(100).optional(),
    description: z.string().max(500).optional(),
  }),
  z.object({
    name: z.string().min(1).max(255),
    type: z.literal("redshift"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(5439),
    databaseName: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    ssl: z.boolean().default(true), // always required for Redshift
    serviceName: z.string().optional(),
    environment: z.string().optional(),
    folder: z.string().trim().max(100).optional(),
    description: z.string().max(500).optional(),
  }),
  z.object({
    name: z.string().min(1).max(255),
    type: z.literal("mongodb"),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(27017),
    databaseName: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    ssl: z.boolean().default(false),
    serviceName: z.string().optional(),
    environment: z.string().optional(),
    folder: z.string().trim().max(100).optional(),
    description: z.string().max(500).optional(),
  }),
]);

// Update schema: accept any partial subset of the create fields
export const UpdateDatabaseSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(DB_ENGINE_TYPES).optional(),
  host: z.string().optional(),
  port: z.number().int().min(0).max(65535).optional(),
  databaseName: z.string().min(1).optional(),
  username: z.string().optional(),
  // An empty string means "keep the saved password" (the edit form's "leave empty" field).
  password: z.string().optional(),
  ssl: z.boolean().optional(),
  serviceName: z.string().optional(),
  environment: z.string().optional(),
  folder: z.string().trim().max(100).optional(),
  description: z.string().max(500).optional(),
  favourite: z.boolean().optional(),
});

export const SetStatusSchema = z.object({
  status: z.enum(["enabled", "disabled"]),
});

export type CreateDatabaseInput = z.infer<typeof CreateDatabaseSchema>;
export type UpdateDatabaseInput = z.infer<typeof UpdateDatabaseSchema>;
export type SetStatusInput = z.infer<typeof SetStatusSchema>;

// ---------------------------------------------------------------------------
// Response types — credentials stripped, dates as ISO strings
// ---------------------------------------------------------------------------

export interface DatabaseConnection {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  ssl: boolean;
  serviceName: string | null;
  environment: string | null;
  folder: string | null;
  description: string | null;
  favourite: boolean;
  status: string;
  lastTestedAt: string | null;
  lastTestStatus: "reachable" | "unreachable" | null;
  lastTestMessage: string | null;
  lastTestLatencyMs: number | null;
  serverVersion: string | null;
  /** Latest query or tool call made by an AI client through MCP, or null. */
  lastUsedByAiAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestResult {
  success: boolean;
  message: string;
  hint?: string;
  latencyMs?: number;
  code?: string;
  serverVersion?: string;
}

export const ExecuteQuerySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(1000).optional(),
});

const optionalSchema = z.string().min(1).max(255).optional();
export const SchemaQuerySchema = z.object({ filter: z.string().max(255).optional() });
export const TableSchemaQuerySchema = z.object({ schema: optionalSchema });
export const BrowseRowsQuerySchema = z.object({
  schema: optionalSchema,
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  orderBy: z.string().min(1).max(255).optional(),
  direction: z.enum(["asc", "desc"]).default("asc"),
});
export const TestConnectionSchema = z
  .union(
    CreateDatabaseSchema.options.map((schema) =>
      schema
        .extend({ id: z.string().min(1).optional() })
        .extend({ password: z.string().optional().default("") }),
    ),
  )
  .superRefine((input, context) => {
    if (input.type === "sqlite") return;
    if (!input.host.trim())
      context.addIssue({
        code: "custom",
        path: ["host"],
        message: "Host is required for this database engine",
      });
    if (!input.username.trim())
      context.addIssue({
        code: "custom",
        path: ["username"],
        message: "Username is required for this database engine",
      });
    if (!input.id && !input.password)
      context.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password is required for a new connection test",
      });
  });
export const DuplicateDatabaseSchema = z.object({ name: z.string().min(1).max(255).optional() });

export type ExecuteQueryInput = z.infer<typeof ExecuteQuerySchema>;
export type BrowseRowsInput = z.infer<typeof BrowseRowsQuerySchema>;
export type TestConnectionInput = z.infer<typeof TestConnectionSchema>;

export interface StructuredQueryResult {
  success: boolean;
  executionTimeMs: number;
  rowCount: number;
  columns: { name: string }[];
  rows: Record<string, unknown>[];
  error: string | null;
  truncated: boolean;
  hint: string | null;
}

export interface SchemaTree {
  engine: DbEngineType;
  schemas: {
    name: string;
    tables: { name: string; type: "table" | "view" | "collection"; rowEstimate: number | null }[];
  }[];
}

export interface TableStructure {
  schema: string;
  name: string;
  type: "table" | "view" | "collection";
  columns: {
    name: string;
    dataType: string;
    nullable: boolean;
    default: string | null;
    isPrimaryKey: boolean;
    comment: string | null;
  }[];
  indexes: { name: string; columns: string[]; unique: boolean; primary: boolean }[];
  foreignKeys: {
    name: string;
    columns: string[];
    refSchema: string | null;
    refTable: string;
    refColumns: string[];
  }[];
  rowEstimate: number | null;
}

export interface BrowseRowsResult {
  columns: { name: string; dataType: string }[];
  rows: Record<string, unknown>[];
  limit: number;
  offset: number;
  hasMore: boolean;
  executionTimeMs: number;
}

export interface QueryLogItem {
  id: string;
  databaseConnectionId: string;
  query: string;
  executionTimeMs: number | null;
  rowCount: number | null;
  status: string;
  error: string | null;
  source: "mcp" | "app";
  createdAt: string;
}
