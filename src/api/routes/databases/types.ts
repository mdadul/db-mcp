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
  password: z.string().min(1).optional(),
  ssl: z.boolean().optional(),
  serviceName: z.string().optional(),
  environment: z.string().optional(),
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
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestResult {
  success: boolean;
  message: string;
  hint?: string;
  latencyMs?: number;
}

export const ExecuteQuerySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(1000).optional(),
});

export type ExecuteQueryInput = z.infer<typeof ExecuteQuerySchema>;

export interface StructuredQueryResult {
  success: boolean;
  executionTimeMs: number;
  rowCount: number;
  columns: string[];
  rows: Record<string, unknown>[];
  error: string | null;
}

export interface QueryLogItem {
  id: string;
  databaseConnectionId: string;
  query: string;
  executionTimeMs: number | null;
  rowCount: number | null;
  status: string;
  error: string | null;
  createdAt: string;
}

