import { useCallback, useEffect, useState } from "react";
import type { DatabaseConnection } from "../types";
import { ACTIVE_TAB_KEY, STORAGE_KEY, defaultQuery, readStoredActiveTabs, readStoredTabs, type TabKind, type TableRef, type WorkbenchTab } from "./model";

const newTabId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Document tabs per connection, persisted to localStorage. */
export function useWorkbenchTabs(selectedId: string, connection: DatabaseConnection | undefined) {
  const [tabsByConnection, setTabsByConnection] = useState<Record<string, WorkbenchTab[]>>(readStoredTabs);
  const [activeByConnection, setActiveByConnection] = useState<Record<string, string>>(readStoredActiveTabs);
  const [selectedTable, setSelectedTable] = useState<TableRef | null>(null);

  const tabs = selectedId ? tabsByConnection[selectedId] ?? [] : [];
  const activeId = selectedId ? activeByConnection[selectedId] ?? tabs[0]?.id : undefined;
  const activeTab = tabs.find((tab) => tab.id === activeId);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(tabsByConnection)); }, [tabsByConnection]);
  useEffect(() => { localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify(activeByConnection)); }, [activeByConnection]);

  // A connection with no tabs starts with one query tab.
  useEffect(() => {
    if (!connection || tabs.length) return;
    const first: WorkbenchTab = { id: `query-${connection.id}`, kind: "query", label: "Query 1", query: defaultQuery(connection) };
    setTabsByConnection((current) => ({ ...current, [connection.id]: [first] }));
    setActiveByConnection((current) => ({ ...current, [connection.id]: first.id }));
  }, [connection, tabs.length]);

  const patchTabs = useCallback((connectionId: string, update: (list: WorkbenchTab[]) => WorkbenchTab[]) => {
    setTabsByConnection((current) => ({ ...current, [connectionId]: update(current[connectionId] ?? []) }));
  }, []);

  const activate = useCallback((connectionId: string, tabId: string) => {
    setActiveByConnection((current) => ({ ...current, [connectionId]: tabId }));
  }, []);

  /** Opens a tab on a connection. Table tabs are reused when one already exists for that table. */
  const openTab = useCallback((connectionId: string, kind: TabKind, table?: TableRef, query?: string) => {
    const currentTabs = tabsByConnection[connectionId] ?? [];
    const existing = table ? currentTabs.find((tab) => tab.kind !== "query" && tab.schema === table.schema && tab.table === table.name) : undefined;
    const isSelected = connectionId === selectedId;
    const nextTab: WorkbenchTab = existing ?? {
      id: newTabId(kind),
      kind,
      label: kind === "query" ? `Query ${currentTabs.filter((tab) => tab.kind === "query").length + 1}` : table?.name ?? (kind === "data" ? "Data" : "Structure"),
      ...(table ? { table: table.name, schema: table.schema } : {}),
      ...(kind === "query" ? { query: query ?? defaultQuery(isSelected ? connection : undefined) } : {}),
    };
    if (!existing) patchTabs(connectionId, (list) => [...list, nextTab]);
    else if (existing.kind !== kind) patchTabs(connectionId, (list) => list.map((tab) => (tab.id === existing.id ? { ...tab, kind } : tab)));
    activate(connectionId, nextTab.id);
    if (table) setSelectedTable(table);
  }, [activate, connection, patchTabs, selectedId, tabsByConnection]);

  const closeTab = useCallback((connectionId: string, tabId: string) => {
    const next = (tabsByConnection[connectionId] ?? []).filter((tab) => tab.id !== tabId);
    const wasActive = tabId === (activeByConnection[connectionId] ?? tabsByConnection[connectionId]?.[0]?.id);
    patchTabs(connectionId, () => next);
    if (wasActive) activate(connectionId, next.at(-1)?.id ?? "");
  }, [activate, activeByConnection, patchTabs, tabsByConnection]);

  const selectTab = useCallback((connectionId: string, tabId: string) => {
    activate(connectionId, tabId);
    const selected = (tabsByConnection[connectionId] ?? []).find((tab) => tab.id === tabId);
    setSelectedTable(selected?.table ? { schema: selected.schema ?? "", name: selected.table } : null);
  }, [activate, tabsByConnection]);

  const updateTabQuery = useCallback((connectionId: string, tabId: string, query: string) => {
    patchTabs(connectionId, (list) => list.map((tab) => (tab.id === tabId ? { ...tab, query } : tab)));
  }, [patchTabs]);

  return { tabsByConnection, tabs, activeId, activeTab, selectedTable, setSelectedTable, openTab, closeTab, selectTab, updateTabQuery };
}
