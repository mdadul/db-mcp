/**
 * Helpers for Redshift table metadata used by get_table_schema.
 *
 * SVV_TABLE_INFO has no `distkey` column. The distribution key is only exposed
 * through `diststyle`, e.g. `KEY(customer_id)`, `EVEN`, `ALL` or `AUTO(KEY(id))`.
 */

/** Returns the distribution key column from a SVV_TABLE_INFO `diststyle` value, or null. */
export function parseRedshiftDistKey(diststyle: unknown): string | null {
  if (typeof diststyle !== "string") return null;
  const match = /KEY\(\s*"?([^")\s]+)"?\s*\)/i.exec(diststyle);
  return match?.[1] ?? null;
}

/**
 * Splits a table reference into schema and table. get_database_schema returns
 * Redshift tables as `schema.table`, so agents pass that form back.
 */
export function splitQualifiedTableName(name: string): { schema: string | null; table: string } {
  const dot = name.indexOf(".");
  if (dot <= 0 || dot === name.length - 1) return { schema: null, table: name };
  return { schema: name.slice(0, dot), table: name.slice(dot + 1) };
}
