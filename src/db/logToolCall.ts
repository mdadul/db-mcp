import { db } from "./client.ts";
import { toolCalls } from "./schema.ts";

const MAX_TOOL_ARGS_BYTES = 2 * 1024;
const SENSITIVE_ARGUMENT_KEY = /password|passwd|secret|token|api[_-]?key|authorization|credential|connectionstring|dsn/i;
const SENSITIVE_ASSIGNMENT = /(password|passwd|secret|token|api[_-]?key|authorization|credential)(\s*[=:]\s*)(?:'[^']*'|"[^"]*"|[^\s,;&)]+)/gi;

function sanitizeText(value: string): string {
  return value
    .replace(/([a-z][a-z\d+.-]*:\/\/[^:/\s@]+:)[^@/\s]+@/gi, "$1[REDACTED]@")
    .replace(SENSITIVE_ASSIGNMENT, "$1$2[REDACTED]");
}

/** Redacts SQL string literals and credential-looking assignments before the text is stored. */
export function sanitizeQuery(query: string): string {
  return sanitizeText(query.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, "'[REDACTED]'"));
}

function redactArguments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactArguments);
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (SENSITIVE_ARGUMENT_KEY.test(key)) return [key, "[REDACTED]"];
    if (key.toLowerCase() === "query" && typeof item === "string") return [key, sanitizeQuery(item)];
    return [key, redactArguments(item)];
  }));
}

/** Serialises tool arguments for activity details without exposing credentials. */
export function sanitizeToolArgs(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value) as unknown; }
    catch { /* Preserve non-JSON values after applying string redaction. */ }
  }

  const serialized = JSON.stringify(redactArguments(parsed));
  if (serialized === undefined) return null;
  const encoded = new TextEncoder().encode(serialized);
  if (encoded.byteLength <= MAX_TOOL_ARGS_BYTES) return serialized;

  const suffix = new TextEncoder().encode("…");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let end = MAX_TOOL_ARGS_BYTES - suffix.byteLength; end >= 0; end -= 1) {
    try {
      return `${decoder.decode(encoded.slice(0, end))}…`;
    } catch { /* Trim any partial multibyte character before appending the marker. */ }
  }
  return "…";
}

export function logToolCall(
  tool: string,
  status: "success" | "error" = "success",
  databaseConnectionId?: string,
  args?: unknown,
): void {
  db.insert(toolCalls)
    .values({ tool, status, databaseConnectionId: databaseConnectionId ?? null, args: sanitizeToolArgs(args) })
    .catch(() => {});
}
