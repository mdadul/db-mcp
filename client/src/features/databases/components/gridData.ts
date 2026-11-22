export interface GridColumn { name: string; dataType: string; }
export type CellKind = "null" | "boolean" | "number" | "binary" | "json" | "text";

/** Short display text for a cell. Long values are cut to `maxLength` characters. */
export function formatValue(value: unknown, maxLength = 200): string {
  if (value === null || value === undefined) return "NULL";
  const binary = binaryLength(value);
  if (binary !== null) return `<binary ${binary.toLocaleString()} bytes>`;
  let text: string;
  if (typeof value === "string") text = value;
  else { try { text = JSON.stringify(value, null, 2) ?? String(value); } catch { text = String(value); } }
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** Byte length when a value is a serialised Buffer ({ type: "Buffer", data: [...] }), otherwise null. */
function binaryLength(value: unknown): number | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { type?: unknown; data?: unknown };
  return candidate.type === "Buffer" && Array.isArray(candidate.data) ? candidate.data.length : null;
}

export function cellKind(value: unknown): CellKind {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number" || typeof value === "bigint") return "number";
  if (binaryLength(value) !== null) return "binary";
  if (typeof value === "object") return "json";
  return "text";
}

function plainText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") { try { return JSON.stringify(value) ?? ""; } catch { return String(value); } }
  return String(value);
}

function delimited(rows: Record<string, unknown>[], columns: string[], separator: "," | "\t"): string {
  const escape = (text: string) => separator === ","
    ? (/[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text)
    : text.replace(/[\t\r\n]+/g, " ");
  const lines = [columns.map(escape).join(separator), ...rows.map((row) => columns.map((column) => escape(plainText(row[column]))).join(separator))];
  return lines.join("\n");
}

export const toCsv = (rows: Record<string, unknown>[], columns: string[]) => delimited(rows, columns, ",");
export const toTsv = (rows: Record<string, unknown>[], columns: string[]) => delimited(rows, columns, "\t");

export function toJson(rows: Record<string, unknown>[], columns: string[]): string {
  return JSON.stringify(rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))), null, 2);
}

function sqlLiteral(value: unknown): string {
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${plainText(value).replaceAll("'", "''")}'`;
}

/** Parenthesised, de-duplicated IN-list of non-null values, e.g. (1, 2, 'x'). */
export function toSqlInList(values: unknown[]): string {
  const unique = new Map<string, unknown>();
  for (const value of values) if (value !== null && value !== undefined) unique.set(JSON.stringify(value), value);
  return `(${[...unique.values()].map(sqlLiteral).join(", ")})`;
}

export function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Row height from the --row-h token, falling back to 28px. */
export function rowHeight(): number {
  const parsed = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-h"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 28;
}
