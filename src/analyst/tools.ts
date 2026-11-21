import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { databaseConnections } from "../db/schema.ts";
import * as databaseService from "../api/routes/databases/service.ts";
import { BadRequestError } from "../errors.ts";
import { quoteIdentifier } from "../query/identifiers.ts";
import type { DbEngineType } from "../api/routes/databases/types.ts";
import { previewRows, getResult, storeResult } from "./resultStore.ts";
import { profileRows } from "./profiling.ts";
import { createArtifact, type ArtifactKind } from "./artifacts.ts";

const encType = z.enum(["quantitative", "temporal", "nominal", "ordinal"]);
const aggregate = z.enum(["sum", "mean", "count", "min", "max", "median"]);
const sortSpec = z.union([z.enum(["ascending", "descending", "x", "y"]), z.object({ field: z.string().min(1), order: z.enum(["ascending", "descending"]), op: aggregate.optional() }).strict()]);
const encodingSchema = z.object({
  field: z.string().min(1),
  type: encType.optional(),
  aggregate: aggregate.optional(),
  bin: z.union([z.boolean(), z.object({ maxbins: z.number().int().min(1).max(12) }).strict()]).optional(),
  timeUnit: z.enum(["year", "yearmonth", "yearmonthdate", "yearmonthdatehours", "yearmonthdatehoursminutes", "hours", "hoursminutes", "month", "date", "day", "week", "quarter"]).optional(),
  sort: sortSpec.optional(),
  stack: z.union([z.enum(["zero", "normalize", "center"]), z.null()]).optional(),
  title: z.string().max(120).optional(),
}).strict();
const chartSpecSchema = z.object({
  mark: z.enum(["bar", "line", "area", "point", "arc", "rect", "tick"]),
  encoding: z.object({
    x: encodingSchema.optional(),
    y: encodingSchema.optional(),
    color: encodingSchema.optional(),
    size: encodingSchema.optional(),
    theta: encodingSchema.optional(),
    tooltip: z.union([encodingSchema, z.array(encodingSchema).max(8)]).optional(),
  }).strict(),
}).strict();
const CHART_HINT = "Allowed spec fields: mark (bar|line|area|point|arc|rect|tick), encoding (x|y|color|size|theta|tooltip); each encoding uses a result field plus optional type (quantitative|temporal|nominal|ordinal), aggregate (sum|mean|count|min|max|median), bin, timeUnit, sort, stack, title. SQL-aggregate data before charting; transforms are not supported.";

export const ANALYST_PLAYBOOKS = [
  { id: "profile-table", title: "Profile this table", description: "Inspect column types, missing values, distributions, and outliers.", promptTemplate: "Profile {table} in {database}. Start by inspecting its schema, then sample and profile the table." },
  { id: "data-quality", title: "Data quality report", description: "Find missing values, duplicates, inconsistent types, and suspicious ranges.", promptTemplate: "Create a data quality report for {table} in {database}. Quantify each issue and include caveats." },
  { id: "trend-over-time", title: "Trend over time", description: "Analyze a metric over a time period and chart the trend.", promptTemplate: "Analyze the trend over time for {table} in {database}. Profile relevant fields, aggregate by an appropriate time grain, and render a chart." },
  { id: "compare-periods", title: "Compare two periods", description: "Compare metrics between two time periods.", promptTemplate: "Compare two periods for {table} in {database}. Ask for the periods and metric if they are unclear, then quantify absolute and relative changes." },
  { id: "find-anomalies", title: "Find anomalies", description: "Look for unusual values, spikes, gaps, or distribution changes.", promptTemplate: "Find anomalies in {table} in {database}. Profile the relevant fields and distinguish outliers from data-quality issues." },
  { id: "top-contributors", title: "Top contributors", description: "Rank the categories or entities contributing most to a metric.", promptTemplate: "Find the top contributors in {table} in {database}. Aggregate and rank in SQL, and chart when useful." },
  { id: "explain-schema", title: "Explain this schema", description: "Describe a table's fields, relationships, and likely use.", promptTemplate: "Explain the schema of {table} in {database}. Use the schema tools and clearly separate observed facts from inferences." },
] as const;

export function createAnalystTools(threadId: string, defaultDatabaseId: string | null, messageId: string = crypto.randomUUID(), onArtifactCreated: (event: { artifactId: string; kind: ArtifactKind; title: string; resultId: string }) => void = () => {}) {
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
    profile_result: tool({
      description: "Compute local per-column profiling statistics over the full stored query result. No rows are sent to the model.",
      inputSchema: z.object({ result_id: z.string().min(1), columns: z.array(z.string().min(1)).max(200).optional() }),
      execute: async ({ result_id, columns }) => withToolErrors(async () => {
        const result = getResult(result_id, threadId);
        if (!result) throw new BadRequestError("Analyst result is unavailable", "Run the query again or choose a result from this thread.");
        const unknownColumn = columns?.find((column) => !result.columns.some((item) => item.name === column));
        if (unknownColumn) throw new BadRequestError(`Unknown result column "${unknownColumn}"`, `Choose columns from the result: ${result.columns.map((item) => item.name).join(", ")}.`);
        return { resultId: result_id, rowCount: result.rowCount, truncated: result.truncated, profiles: profileRows(result.columns, result.rows, columns), hint: "Profiles are computed locally across all rows in the stored result." };
      }),
    }),
    profile_table: tool({
      description: "Sample a validated table, store it as a result, and profile its columns locally. This is a sample, not the full table.",
      inputSchema: z.object({ database_id: z.string().optional(), table: z.string().min(1), schema: z.string().optional(), sample_limit: z.number().int().min(1).max(10_000).default(1000) }),
      execute: async ({ database_id, table, schema, sample_limit }) => withToolErrors(async () => {
        const id = requireDatabaseId(database_id);
        const structure = await databaseService.getTableSchemaApi(id, table, schema);
        const [connection] = await db.select({ type: databaseConnections.type }).from(databaseConnections).where(eq(databaseConnections.id, id));
        if (!connection) throw new BadRequestError("Database is unavailable", "Choose an enabled database connection.");
        const engine = connection.type as DbEngineType;
        const query = engine === "mongodb"
          ? JSON.stringify({ collection: structure.name, limit: sample_limit })
          : `SELECT * FROM ${engine === "sqlite" ? `${quoteIdentifier(structure.schema, engine)}.` : ""}${quoteIdentifier(structure.name, engine)} LIMIT ${sample_limit}`;
        const result = await databaseService.executeQueryStructured(id, query, sample_limit, "agent");
        if (!result.success) return { error: result.error ?? "Unable to sample table", hint: result.hint ?? "Check table permissions and the schema." };
        const stored = storeResult({ threadId, columns: result.columns.length ? result.columns : structure.columns.map(({ name }) => ({ name })), rows: result.rows, rowCount: result.rowCount, truncated: result.truncated });
        return { resultId: stored.resultId, columns: stored.columns, rowCount: stored.rowCount, rowEstimate: structure.rowEstimate, sample: true, truncated: stored.truncated, profiles: profileRows(stored.columns, stored.rows), hint: "These profiles describe only the sampled rows, not necessarily the full table. Use run_query with SQL aggregates for full-table conclusions." };
      }),
    }),
    render_chart: tool({
      description: "Persist a chart artifact referencing a stored result. The UI loads the result by resultId; do not put data in the chart spec.",
      inputSchema: z.object({ result_id: z.string().min(1), title: z.string().trim().min(1).max(200), spec: z.unknown() }),
      execute: async ({ result_id, title, spec }) => withToolErrors(async () => {
        const result = getResult(result_id, threadId);
        if (!result) throw new BadRequestError("Analyst result is unavailable", "Run the query again or choose a result from this thread.");
        const parsed = chartSpecSchema.safeParse(spec);
        if (!parsed.success) return { error: `Invalid chart spec: ${parsed.error.issues.map((issue) => issue.path.join(".") || "spec").join(", ")}.`, hint: CHART_HINT };
        const fields = Object.values(parsed.data.encoding).flatMap((encoding) => Array.isArray(encoding) ? encoding.map((item) => item.field) : encoding ? [encoding.field] : []);
        const unknownField = fields.find((field) => !result.columns.some((column) => column.name === field));
        if (unknownField) return { error: `Unknown chart field "${unknownField}".`, hint: `${CHART_HINT} Result columns: ${result.columns.map(({ name }) => name).join(", ")}.` };
        const artifact = await createArtifact({ threadId, messageId, kind: "chart", title, resultId: result_id, spec: parsed.data, result });
        onArtifactCreated({ artifactId: artifact.id, kind: artifact.kind, title: artifact.title, resultId: artifact.resultId });
        return { artifactId: artifact.id, resultId: result_id, kind: "chart", title, hint: "Chart artifact is ready for the UI; reference its artifactId in the findings." };
      }),
    }),
    render_table: tool({
      description: "Persist a table artifact referencing a stored result, optionally selecting and ordering result columns.",
      inputSchema: z.object({ result_id: z.string().min(1), title: z.string().trim().min(1).max(200), columns: z.array(z.string().min(1)).max(200).optional() }),
      execute: async ({ result_id, title, columns }) => withToolErrors(async () => {
        const result = getResult(result_id, threadId);
        if (!result) throw new BadRequestError("Analyst result is unavailable", "Run the query again or choose a result from this thread.");
        const selected = columns ?? result.columns.map(({ name }) => name);
        const unknownColumn = selected.find((column) => !result.columns.some((item) => item.name === column));
        if (unknownColumn) return { error: `Unknown result column "${unknownColumn}".`, hint: `Choose columns from the result: ${result.columns.map(({ name }) => name).join(", ")}.` };
        const artifact = await createArtifact({ threadId, messageId, kind: "table", title, resultId: result_id, spec: { columns: selected }, result: { ...result, columns: selected.map((name) => ({ name })), rows: result.rows.map((row) => Object.fromEntries(selected.map((name) => [name, row[name]]))) } });
        onArtifactCreated({ artifactId: artifact.id, kind: artifact.kind, title: artifact.title, resultId: artifact.resultId });
        return { artifactId: artifact.id, resultId: result_id, kind: "table", title, hint: "Table artifact is ready for the UI; reference its artifactId in the findings." };
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
