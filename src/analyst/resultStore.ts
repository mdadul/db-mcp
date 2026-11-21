import { randomUUID } from "node:crypto";

const MAX_RESULTS = 50;
const MAX_RESULT_BYTES = 20 * 1024 * 1024;

export interface StoredResult {
  resultId: string;
  threadId: string;
  columns: { name: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

interface Entry {
  result: StoredResult;
  bytes: number;
}

const entries = new Map<string, Entry>();
let storedBytes = 0;

export function storeResult(input: Omit<StoredResult, "resultId">): StoredResult {
  const result = { ...input, resultId: randomUUID() };
  const bytes = Buffer.byteLength(JSON.stringify(result));
  entries.set(result.resultId, { result, bytes });
  storedBytes += bytes;
  evictOldest();
  return result;
}

export function getResult(resultId: string, threadId?: string): StoredResult | undefined {
  const entry = entries.get(resultId);
  if (!entry || (threadId && entry.result.threadId !== threadId)) return undefined;
  entries.delete(resultId);
  entries.set(resultId, entry);
  return entry.result;
}

export function clearResults(): void {
  entries.clear();
  storedBytes = 0;
}

export function resultStoreSize(): { count: number; bytes: number } {
  return { count: entries.size, bytes: storedBytes };
}

function evictOldest(): void {
  while (entries.size > MAX_RESULTS || storedBytes > MAX_RESULT_BYTES) {
    const oldestId = entries.keys().next().value;
    if (!oldestId) return;
    const oldest = entries.get(oldestId);
    if (oldest) storedBytes -= oldest.bytes;
    entries.delete(oldestId);
  }
}

export function previewRows(rows: Record<string, unknown>[], maxRows = 20): Record<string, unknown>[] {
  return rows.slice(0, maxRows).map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (typeof value === "string") return [key, truncateText(value)];
      if (value && typeof value === "object") return [key, truncateText(JSON.stringify(value))];
      return [key, value];
    })
  ));
}

function truncateText(value: string): string {
  return value.length > 200 ? `${value.slice(0, 199)}…` : value;
}
