import type { DbEngineType } from "../api/routes/databases/types.ts";

const WRITE_PATTERN =
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|MERGE|CALL|EXEC|GRANT|REVOKE|LOCK|UNLOCK|SET|LOAD)\b/i;

const READ_PATTERN =
  /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/i;

export const QUERY_TIMEOUT_MS = 10_000;
export const MAX_ROWS = 100;

export type DbType = DbEngineType;

const MONGO_ALLOWED_KEYS = new Set(["collection", "filter", "projection", "sort", "limit"]);
// Operators that execute arbitrary code or write/export data — never allowed in a read-only DSL
const MONGO_UNSAFE_OPERATORS = /\$where|\$function|\$accumulator|\$out|\$merge/i;

export function assertReadOnly(query: string, dbType: DbType = "postgresql"): void {
  if (dbType === "mongodb") {
    assertMongoReadOnly(query);
    return;
  }

  // Block multi-statement queries — a leading SELECT cannot excuse a trailing DROP
  const statements = query.split(";").map((s) => s.trim()).filter(Boolean);
  if (statements.length > 1) {
    throw new Error(
      "Multi-statement queries are not allowed. Send one statement at a time."
    );
  }
  if (!READ_PATTERN.test(query) || WRITE_PATTERN.test(query)) {
    throw new Error(
      "Only read-only queries are allowed (SELECT, SHOW, DESCRIBE, EXPLAIN)."
    );
  }
}

/**
 * MongoDB has no SQL text to pattern-match, so queries are a JSON DSL:
 * {"collection": "orders", "filter": {}, "projection": {}, "sort": {}, "limit": 20}
 * Only a whitelisted shape reaches find() — no aggregate/code-executing operators.
 */
function assertMongoReadOnly(query: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(query);
  } catch {
    throw new Error(
      'MongoDB queries must be a JSON object, e.g. {"collection":"orders","filter":{}}. Shell/JS syntax is not supported.'
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("MongoDB query must be a JSON object.");
  }
  const dsl = parsed as Record<string, unknown>;

  if (typeof dsl.collection !== "string" || !dsl.collection.trim()) {
    throw new Error('MongoDB query requires a "collection" string field.');
  }

  for (const key of Object.keys(dsl)) {
    if (!MONGO_ALLOWED_KEYS.has(key)) {
      throw new Error(
        `Unsupported field "${key}" in MongoDB query. Allowed fields: ${[...MONGO_ALLOWED_KEYS].join(", ")}.`
      );
    }
  }

  const serialized = JSON.stringify({ filter: dsl.filter, projection: dsl.projection, sort: dsl.sort });
  if (MONGO_UNSAFE_OPERATORS.test(serialized)) {
    throw new Error(
      "Operators that execute code or write/export data ($where, $function, $accumulator, $out, $merge) are not allowed."
    );
  }
}

/**
 * Append a LIMIT clause to SELECT queries that do not already have one.
 * Leaves EXPLAIN / SHOW / DESCRIBE unchanged. For MongoDB, fills in a
 * default "limit" field in the JSON DSL if the caller didn't set one.
 */
export function injectLimit(query: string, limit: number = MAX_ROWS, dbType: DbType = "postgresql"): string {
  if (dbType === "mongodb") {
    const dsl = JSON.parse(query) as Record<string, unknown>;
    if (typeof dsl.limit !== "number") dsl.limit = limit;
    return JSON.stringify(dsl);
  }

  const trimmed = query.trimEnd().replace(/;$/, "");
  if (/\bLIMIT\b/i.test(trimmed)) return trimmed;
  if (/^\s*SELECT/i.test(trimmed)) return `${trimmed} LIMIT ${limit}`;
  return trimmed;
}
