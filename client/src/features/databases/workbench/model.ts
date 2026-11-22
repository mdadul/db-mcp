import { DB_ENGINES, type DatabaseConnection } from "../types";
import type { RecentQueryItem, RecentTableItem } from "../components/ConnectionsHome";

export type TabKind = "data" | "structure" | "query";
export interface WorkbenchTab { id: string; kind: TabKind; label: string; table?: string; schema?: string; query?: string; }
export interface TableRef { schema: string; name: string; }
export type TestState = "reachable" | "unreachable";

export const STORAGE_KEY = "dbmcp.workbench.v1";
export const ACTIVE_TAB_KEY = "dbmcp.workbenchActive.v1";
export const QUERY_HISTORY_KEY = "dbmcp.queryHistory.v1";
export const FAVOURITES_KEY = "dbmcp.favouriteTables.v1";
export const HISTORY_LIMIT = 50;
export const READ_ONLY_TOOLTIP = "Queries pass a read-only guard before they run. Write statements are rejected before reaching the database; use a read-only database account for defense in depth.";

export const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function defaultQuery(connection: DatabaseConnection | undefined): string {
  return connection?.type === "mongodb" ? '{"collection":"collection_name","filter":{},"limit":100}' : "SELECT 1";
}

/** Starter query for "open data" from the schema tree's context menu. */
export function browseQuery(connection: DatabaseConnection | undefined, table: TableRef): string {
  if (connection?.type === "mongodb") return JSON.stringify({ collection: table.name, filter: {}, limit: 100 }, null, 2);
  const target = connection?.type === "sqlite" ? quoteIdentifier(table.name) : `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
  return `SELECT * FROM ${target} LIMIT 100`;
}

export function connectionStatus(item: DatabaseConnection, testState?: TestState) {
  if (item.status === "disabled") return { state: "neutral" as const, label: "Disabled" };
  if (testState === "reachable") return { state: "healthy" as const, label: "Reachable in the last connection test" };
  if (testState === "unreachable") return { state: "error" as const, label: "Unreachable in the last connection test" };
  return null;
}

export function connectionSubtitle(item: DatabaseConnection) {
  if (item.type === "sqlite") return { text: item.databaseName, title: item.databaseName };
  return { text: `${item.databaseName} · ${item.host}`, title: `${item.databaseName} · ${item.host}:${item.port}` };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (typeof value === "object" && value !== null) return value as T;
  } catch {
    // Corrupt storage falls back to the empty state.
  }
  return fallback;
}

export const readStoredTabs = () => readJson<Record<string, WorkbenchTab[]>>(STORAGE_KEY, {});
export const readStoredActiveTabs = () => readJson<Record<string, string>>(ACTIVE_TAB_KEY, {});
export const readStoredHistory = () => readJson<Record<string, string[]>>(QUERY_HISTORY_KEY, {});
export const writeStoredHistory = (history: Record<string, string[]>) => localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(history));
export const readStoredFavourites = () => readJson<Record<string, string[]>>(FAVOURITES_KEY, {});
export const writeStoredFavourites = (favourites: Record<string, string[]>) => localStorage.setItem(FAVOURITES_KEY, JSON.stringify(favourites));

/** Stable key for a table, safe for schema names that contain dots. */
export const tableKey = (table: TableRef) => JSON.stringify([table.schema, table.name]);

/** Most recent distinct tables opened on one connection, newest first. */
export function recentTablesFor(tabs: WorkbenchTab[]): TableRef[] {
  const seen = new Set<string>();
  const result: TableRef[] = [];
  for (const tab of [...tabs].reverse()) {
    if (!tab.table) continue;
    const ref: TableRef = { schema: tab.schema ?? "", name: tab.table };
    const key = tableKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
    if (result.length === 5) break;
  }
  return result;
}

export function collectRecentTables(tabsByConnection: Record<string, WorkbenchTab[]>, connections: DatabaseConnection[]): RecentTableItem[] {
  const byId = new Map(connections.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const result: RecentTableItem[] = [];
  for (const [connectionId, tabs] of Object.entries(tabsByConnection)) {
    const connection = byId.get(connectionId);
    if (!connection) continue;
    for (const tab of [...tabs].reverse()) {
      if (!tab.table) continue;
      const schema = tab.schema ?? "";
      const key = `${connectionId}:${schema}:${tab.table}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ connectionId, connectionName: connection.name, engine: connection.type, schema, table: tab.table });
      if (result.length === 5) return result;
    }
  }
  return result;
}

export function collectRecentQueries(historyByConnection: Record<string, string[]>, connections: DatabaseConnection[]): RecentQueryItem[] {
  const byId = new Map(connections.map((item) => [item.id, item]));
  const result: RecentQueryItem[] = [];
  for (const [connectionId, queries] of Object.entries(historyByConnection)) {
    const connection = byId.get(connectionId);
    if (!connection) continue;
    for (const query of queries) {
      result.push({ connectionId, connectionName: connection.name, engine: connection.type, query });
      if (result.length === 5) return result;
    }
  }
  return result;
}

export type GroupMode = "status" | "engine" | "folder";

export function groupedConnections(items: DatabaseConnection[], mode: GroupMode): [string, DatabaseConnection[]][] {
  const groups = new Map<string, DatabaseConnection[]>();
  for (const item of items) {
    const label = groupLabel(item, mode);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups];
}

function groupLabel(item: DatabaseConnection, mode: GroupMode): string {
  if (mode === "status") return item.status === "enabled" ? "Enabled" : "Disabled";
  if (mode === "folder") return item.folder?.trim() || "No folder";
  return DB_ENGINES.find((engine) => engine.type === item.type)?.label ?? item.type;
}

/** Colour family for an environment label. Known names map to fixed tones; anything else is neutral. */
export function environmentTone(environment: string | null): { label: string; className: string; strip: string } | null {
  const label = environment?.trim();
  if (!label) return null;
  const value = label.toLowerCase();
  if (/^(prod|production|live)$/.test(value)) return { label, className: "border-danger/30 bg-danger-subtle text-danger", strip: "border-t-2 border-t-danger" };
  if (/^(stag|staging|stage|uat|qa|test)$/.test(value)) return { label, className: "border-warning/30 bg-warning-subtle text-warning", strip: "border-t-2 border-t-warning" };
  if (/^(dev|development|local)$/.test(value)) return { label, className: "border-success/30 bg-success-subtle text-success", strip: "border-t-2 border-t-success" };
  return { label, className: "border-border bg-muted text-muted-foreground", strip: "" };
}

export const isProductionEnvironment = (environment: string | null) => /^(prod|production|live)$/.test(environment?.trim().toLowerCase() ?? "");

const PRODUCTION_ACK_KEY = "dbmcp.productionAccessAcknowledged.v1";

/** Whether the user has confirmed AI access for this production connection before. */
export function hasAcknowledgedProduction(connectionId: string): boolean {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PRODUCTION_ACK_KEY) ?? "{}");
    return typeof value === "object" && value !== null && (value as Record<string, unknown>)[connectionId] === true;
  } catch {
    return false;
  }
}

export function acknowledgeProduction(connectionId: string): void {
  const current: Record<string, boolean> = { [connectionId]: true };
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PRODUCTION_ACK_KEY) ?? "{}");
    if (typeof value === "object" && value !== null) Object.assign(current, value);
  } catch {
    // Corrupt storage is replaced below.
  }
  localStorage.setItem(PRODUCTION_ACK_KEY, JSON.stringify(current));
}

/** Short relative time such as "just now", "12 min ago" or "3 h ago", then a date. */
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Connection settings as JSON. Passwords are never part of the connection list, so none are exported. */
export function connectionListExport(connections: DatabaseConnection[]): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    note: "Passwords are not included. Add credentials again after importing.",
    connections: connections.map((item) => ({
      name: item.name,
      type: item.type,
      host: item.host,
      port: item.port,
      databaseName: item.databaseName,
      username: item.username,
      ssl: item.ssl,
      serviceName: item.serviceName,
      environment: item.environment,
      folder: item.folder,
      description: item.description,
      favourite: item.favourite,
    })),
  }, null, 2);
}
