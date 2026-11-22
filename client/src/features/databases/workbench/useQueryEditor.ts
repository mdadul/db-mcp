import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { databaseApi } from "../api/databaseApi";
import type { DatabaseConnection } from "../types";
import { HISTORY_LIMIT, defaultQuery, readStoredHistory, writeStoredHistory, type WorkbenchTab } from "./model";

export type QueryResult = Awaited<ReturnType<typeof databaseApi.executeQuery>>;

/** Mongo queries are JSON objects; the row limit is folded into the payload. */
function mongoPayload(query: string, limit: number): string {
  const dsl: unknown = JSON.parse(query);
  if (typeof dsl !== "object" || dsl === null || Array.isArray(dsl)) throw new Error("Enter a JSON object with a collection field.");
  return JSON.stringify({ ...dsl, limit });
}

/** Query text, run state and per-connection history for the active query tab. */
export function useQueryEditor({ selectedId, connection, activeTab, activeId, updateTabQuery }: {
  selectedId: string;
  connection: DatabaseConnection | undefined;
  activeTab: WorkbenchTab | undefined;
  activeId: string | undefined;
  updateTabQuery: (connectionId: string, tabId: string, query: string) => void;
}) {
  const [queryText, setQueryTextState] = useState("SELECT 1");
  const [queryLimit, setQueryLimit] = useState(100);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<string[]>(() => (selectedId ? readStoredHistory()[selectedId] ?? [] : []));
  const editorRef = useRef<{ view?: EditorView } | null>(null);

  useEffect(() => { if (selectedId) setHistory(readStoredHistory()[selectedId] ?? []); }, [selectedId]);
  useEffect(() => { if (activeTab?.kind === "query") setQueryTextState(activeTab.query ?? defaultQuery(connection)); }, [activeTab?.id, connection?.id, connection?.type]);
  useEffect(() => { setResult(null); setError(null); }, [activeId, selectedId]);

  /** Edits the text and keeps it on the tab so it survives a reload. */
  const setQueryText = useCallback((value: string) => {
    setQueryTextState(value);
    if (selectedId && activeId) updateTabQuery(selectedId, activeId, value);
  }, [activeId, selectedId, updateTabQuery]);

  const useHistoryItem = useCallback((query: string) => {
    setQueryText(query);
    setHistoryOpen(false);
  }, [setQueryText]);

  const runQuery = useCallback(async () => {
    if (!selectedId || !queryText.trim()) return;
    const view = editorRef.current?.view;
    const selected = view?.state.selection.main;
    const selection = selected && selected.from !== selected.to ? view?.state.doc.sliceString(selected.from, selected.to) : "";
    const query = selection || queryText;
    setError(null);
    setResult(null);
    try {
      const payload = connection?.type === "mongodb" ? mongoPayload(query, queryLimit) : query;
      const response = await databaseApi.executeQuery(selectedId, payload, queryLimit);
      setResult(response);
      if (!response.success) setError(response.error ?? "Query failed");
      const next = [query, ...history.filter((item) => item !== query)].slice(0, HISTORY_LIMIT);
      setHistory(next);
      writeStoredHistory({ ...readStoredHistory(), [selectedId]: next });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Query failed");
    }
  }, [connection?.type, history, queryLimit, queryText, selectedId]);

  return { queryText, setQueryText, queryLimit, setQueryLimit, result, error, history, historyOpen, setHistoryOpen, useHistoryItem, runQuery, editorRef };
}
