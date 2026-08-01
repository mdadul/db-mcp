import { z } from "zod";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const CreateDatabaseSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["postgresql", "mysql"]),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(5432),
  databaseName: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  ssl: z.boolean().default(false),
  serviceName: z.string().optional(),
  environment: z.string().optional(),
});

export const UpdateDatabaseSchema = CreateDatabaseSchema.omit({
  password: true,
})
  .partial()
  .extend({ password: z.string().min(1).optional() });

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

