const WRITE_PATTERN =
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|MERGE|CALL|EXEC|GRANT|REVOKE|LOCK|UNLOCK|SET|LOAD)\b/i;

const READ_PATTERN =
  /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/i;

export const QUERY_TIMEOUT_MS = 10_000;
export const MAX_ROWS = 100;

export function assertReadOnly(sql: string): void {
  // Block multi-statement queries — a leading SELECT cannot excuse a trailing DROP
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  if (statements.length > 1) {
    throw new Error(
      "Multi-statement queries are not allowed. Send one statement at a time."
    );
  }
  if (!READ_PATTERN.test(sql) || WRITE_PATTERN.test(sql)) {
    throw new Error(
      "Only read-only queries are allowed (SELECT, SHOW, DESCRIBE, EXPLAIN)."
    );
  }
}

/**
 * Append a LIMIT clause to SELECT queries that do not already have one.
 * Leaves EXPLAIN / SHOW / DESCRIBE unchanged.
 */
export function injectLimit(sql: string, limit: number = MAX_ROWS): string {
  const trimmed = sql.trimEnd().replace(/;$/, "");
  if (/\bLIMIT\b/i.test(trimmed)) return trimmed;
  if (/^\s*SELECT/i.test(trimmed)) return `${trimmed} LIMIT ${limit}`;
  return trimmed;
}
