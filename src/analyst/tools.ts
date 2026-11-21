import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { databaseConnections } from "../db/schema.ts";
import * as databaseService from "../api/routes/databases/service.ts";
import { BadRequestError } from "../errors.ts";
import { previewRows, storeResult } from "./resultStore.ts";

export function createAnalystTools(threadId: string, defaultDatabaseId: string | null) {
  const resolvedDatabaseId = (databaseId?: string) => databaseId || defaultDatabaseId;
  const requireDatabaseId = (databaseId?: string) => {
    const id = resolvedDatabaseId(databaseId);
    if (!id) throw new BadRequestError("No database selected", "Choose a database for this request or set a thread default database.");
    return id;
  };
  const withToolErrors = <T>(execute: () => Promise<T>) => execute().catch((error: unknown) => ({
    error: error instanceof BadRequestError ? error.message : "The database tool could not complete",
    hint: error instanceof BadRequestError ? error.hint ?? "Check the tool inputs and selected database." : "Check that the database is enabled and use its schema tools to verify the requested table or columns.",
  }));

  return {
    list_databases: tool({
      description: "List enabled database connections and their IDs.",
      inputSchema: z.object({}),
      execute: async () => ({ databases: (await databaseService.listDatabases()).filter((item) => item.status === "enabled").map(({ id, name, type, databaseName }) => ({ database_id: id, name, type, database_name: databaseName })), hint: "Use database_id with the schema and query tools." }),
    }),
    get_database_schema: tool({
      description: "List tables in a database. Call this before inspecting or querying tables.",
      inputSchema: z.object({ database_id: z.string().optional(), filter: z.string().max(255).optional() }),
      execute: async ({ database_id, filter }) => withToolErrors(() => databaseService.getDatabaseSchemaApi(requireDatabaseId(database_id), filter)),
    }),
    get_table_schema: tool({
      description: "Inspect the columns, indexes, and foreign keys of a table.",
      inputSchema: z.object({ database_id: z.string().optional(), table: z.string().min(1), schema: z.string().optional() }),
      execute: async ({ database_id, table, schema }) => withToolErrors(() => databaseService.getTableSchemaApi(requireDatabaseId(database_id), table, schema)),
    }),
    run_query: tool({
      description: "Run one read-only SQL/MongoDB query. Full data stays local; the model receives only a preview and resultId. Always use a LIMIT.",
      inputSchema: z.object({ database_id: z.string().optional(), query: z.string().min(1), limit: z.number().int().min(1).max(1000).optional() }),
      execute: async ({ database_id, query, limit }) => withToolErrors(async () => {
        const id = requireDatabaseId(database_id);
        const effectiveLimit = Math.min(limit ?? 100, 1000);
        const [connection] = await db.select({ type: databaseConnections.type }).from(databaseConnections).where(eq(databaseConnections.id, id));
        const safeQuery = connection?.type === "mongodb" ? withMongoLimit(query, effectiveLimit) : query;
        const result = await databaseService.executeQueryStructured(id, safeQuery, effectiveLimit, "agent");
        if (!result.success) return { error: result.error ?? "Query failed", hint: result.hint ?? "Check schema and query syntax; only read-only queries are supported." };
        const stored = storeResult({ threadId, columns: result.columns, rows: result.rows, rowCount: result.rowCount, truncated: result.truncated });
        return { resultId: stored.resultId, columns: stored.columns, rowCount: stored.rowCount, truncated: stored.truncated, previewRows: previewRows(stored.rows), hint: "Full result is available to the UI using resultId." };
      }),
    }),
    sample_rows: tool({
      description: "Browse a small sample of rows from a table (maximum 20).",
      inputSchema: z.object({ database_id: z.string().optional(), table: z.string().min(1), schema: z.string().optional(), limit: z.number().int().min(1).max(20).default(10) }),
      execute: async ({ database_id, table, schema, limit }) => withToolErrors(async () => {
        const sampled = await databaseService.browseTableRows(requireDatabaseId(database_id), table, { schema, limit, offset: 0, direction: "asc" }, "agent");
        return { ...sampled, rows: previewRows(sampled.rows, 20) };
      }),
    }),
  };
}

function withMongoLimit(query: string, limit: number): string {
  const parsed: unknown = JSON.parse(query);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return query;
  const dsl = parsed as Record<string, unknown>;
  dsl.limit = typeof dsl.limit === "number" ? Math.min(dsl.limit, limit) : limit;
  return JSON.stringify(dsl);
}

export async function listEnabledAnalystDatabases() {
  return db.select().from(databaseConnections).where(eq(databaseConnections.status, "enabled"));
}
