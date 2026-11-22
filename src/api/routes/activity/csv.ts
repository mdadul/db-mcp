/** Characters that spreadsheet apps read as the start of a formula. Cells starting with them are prefixed. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV with a header row. Only the listed columns are written, in order. */
export function toCsv(rows: Record<string, unknown>[], columns: readonly string[]): string {
  const lines = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))];
  return `${lines.join("\r\n")}\r\n`;
}
