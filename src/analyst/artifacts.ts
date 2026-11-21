import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { analystArtifacts } from "../db/schema.ts";
import { NotFoundError } from "../errors.ts";
import { toJsonSafe } from "../query/jsonSafe.ts";
import type { StoredResult } from "./resultStore.ts";

const MAX_SNAPSHOT_ROWS = 5_000;
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

export type ArtifactKind = "chart" | "table";
export interface ArtifactView {
  id: string;
  threadId: string;
  messageId: string;
  kind: ArtifactKind;
  title: string;
  resultId: string;
  spec: unknown;
  createdAt: string;
}

export async function createArtifact(input: {
  threadId: string;
  messageId: string;
  kind: ArtifactKind;
  title: string;
  resultId: string;
  spec: unknown;
  result: StoredResult;
}): Promise<ArtifactView> {
  const { snapshot, truncated } = makeSnapshot(input.result);
  const [row] = await db.insert(analystArtifacts).values({
    threadId: input.threadId,
    messageId: input.messageId,
    kind: input.kind,
    title: input.title,
    resultId: input.resultId,
    spec: JSON.stringify(input.spec),
    snapshot: JSON.stringify(snapshot),
    truncated,
  }).returning();
  return toArtifactView(row!);
}

export async function listThreadArtifacts(threadId: string): Promise<ArtifactView[]> {
  const rows = await db.select().from(analystArtifacts).where(eq(analystArtifacts.threadId, threadId)).orderBy(analystArtifacts.createdAt);
  return rows.map(toArtifactView);
}

export async function getArtifactData(id: string): Promise<{
  artifact: ArtifactView;
  columns: { name: string }[];
  rows: Record<string, unknown>[];
  truncated: boolean;
}> {
  const [row] = await db.select().from(analystArtifacts).where(eq(analystArtifacts.id, id));
  if (!row) throw new NotFoundError("Analyst artifact", id);
  let snapshot: unknown;
  try { snapshot = JSON.parse(row.snapshot); } catch { snapshot = { columns: [], rows: [] }; }
  const content = snapshot && typeof snapshot === "object" ? snapshot as { columns?: unknown; rows?: unknown } : {};
  return {
    artifact: toArtifactView(row),
    columns: Array.isArray(content.columns) ? content.columns as { name: string }[] : [],
    rows: Array.isArray(content.rows) ? content.rows as Record<string, unknown>[] : [],
    truncated: row.truncated,
  };
}

function makeSnapshot(result: StoredResult): { snapshot: { columns: { name: string }[]; rows: Record<string, unknown>[] }; truncated: boolean } {
  const columns: { name: string }[] = [];
  const rows: Record<string, unknown>[] = [];
  let truncated = result.truncated || result.rows.length > MAX_SNAPSHOT_ROWS;
  let bytes = Buffer.byteLength(JSON.stringify({ columns, rows }));
  for (const { name } of result.columns) {
    const column = { name };
    const columnBytes = Buffer.byteLength(JSON.stringify(column)) + (columns.length === 0 ? 0 : 1);
    if (bytes + columnBytes > MAX_SNAPSHOT_BYTES) {
      truncated = true;
      break;
    }
    columns.push(column);
    bytes += columnBytes;
  }
  for (const rawRow of result.rows.slice(0, MAX_SNAPSHOT_ROWS)) {
    const safeRow = toJsonSafe(rawRow);
    if (!safeRow || typeof safeRow !== "object" || Array.isArray(safeRow)) {
      truncated = true;
      break;
    }
    const row = Object.fromEntries(Object.entries(safeRow).filter(([name]) => columns.some((column) => column.name === name)));
    const rowBytes = Buffer.byteLength(JSON.stringify(row)) + (rows.length === 0 ? 0 : 1);
    if (bytes + rowBytes > MAX_SNAPSHOT_BYTES) {
      truncated = true;
      break;
    }
    rows.push(row);
    bytes += rowBytes;
  }
  return { snapshot: { columns, rows }, truncated };
}

function toArtifactView(row: typeof analystArtifacts.$inferSelect): ArtifactView {
  let spec: unknown;
  try { spec = JSON.parse(row.spec); } catch { spec = null; }
  return {
    id: row.id,
    threadId: row.threadId,
    messageId: row.messageId,
    kind: row.kind as ArtifactKind,
    title: row.title,
    resultId: row.resultId,
    spec,
    createdAt: row.createdAt.toISOString(),
  };
}
