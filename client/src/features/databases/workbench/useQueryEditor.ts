import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { databaseApi } from "../api/databaseApi";
import type { DatabaseConnection } from "../types";
import { HISTORY_LIMIT, defaultQuery, readStoredHistory, writeStoredHistory, type WorkbenchTab } from "./model";
import { statementAt, splitStatements } from "./sqlText";

export type QueryResult = Awaited<ReturnType<typeof databaseApi.executeQuery>>;
export interface QueryRun { id: string; sql: string; result: QueryResult | null; error: string | null; }

/** Mongo queries are JSON objects; the row limit is folded into the payload. */
function mongoPayload(query: string, limit: number): string {
  const dsl: unknown = JSON.parse(query);
  if (typeof dsl !== "object" || dsl === null || Array.isArray(dsl)) throw new Error("Enter a JSON object with a collection field.");
  return JSON.stringify({ ...dsl, limit });
}

/** Query text, run state (one result per statement) and per-connection history for the active query tab. */
export function useQueryEditor({ selectedId, connection, activeTab, activeId, updateTabQuery }: {
  selectedId: string;
  connection: DatabaseConnection | undefined;
  activeTab: WorkbenchTab | undefined;
  activeId: string | undefined;
  updateTabQuery: (connectionId: string, tabId: string, query: string) => void;
}) {
  const [queryText, setQueryTextState] = useState("SELECT 1");
  const [queryLimit, setQueryLimit] = useState(100);
  const [runs, setRuns] = useState<QueryRun[]>([]);
  const [activeRunIndex, setActiveRunIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<string[]>(() => (selectedId ? readStoredHistory()[selectedId] ?? [] : []));
  const editorRef = useRef<{ view?: EditorView } | null>(null);

  useEffect(() => { if (selectedId) setHistory(readStoredHistory()[selectedId] ?? []); }, [selectedId]);
  useEffect(() => { if (activeTab?.kind === "query") setQueryTextState(activeTab.query ?? defaultQuery(connection)); }, [activeTab?.id, connection?.id, connection?.type]);
  useEffect(() => { setRuns([]); setActiveRunIndex(0); }, [activeId, selectedId]);

  /** Edits the text and keeps it on the tab so it survives a reload. */
  const setQueryText = useCallback((value: string) => {
    setQueryTextState(value);
    if (selectedId && activeId) updateTabQuery(selectedId, activeId, value);
  }, [activeId, selectedId, updateTabQuery]);

  const useHistoryItem = useCallback((query: string) => {
    setQueryText(query);
    setHistoryOpen(false);
  }, [setQueryText]);

  /**
   * Runs the selection, the statement under the cursor, or every statement.
   * `explain` prefixes each statement with EXPLAIN (SQL engines only).
   */
  const runQuery = useCallback(async (scope: "current" | "all" = "current", explain = false) => {
    if (!selectedId || !queryText.trim() || running) return;
    const view = editorRef.current?.view;
    const main = view?.state.selection.main;
    const selection = main && main.from !== main.to ? view?.state.doc.sliceString(main.from, main.to) : "";
    const isMongo = connection?.type === "mongodb";

    let statements: string[];
    if (isMongo || selection) statements = [selection || queryText];
    else if (scope === "all") statements = splitStatements(queryText).map((statement) => statement.text);
    else statements = [statementAt(queryText, main?.head ?? queryText.length)?.text ?? queryText.trim()];

    const executed = explain && !isMongo ? statements.map((statement) => `EXPLAIN ${statement}`) : statements;
    setRunning(true);
    setActiveRunIndex(0);
    const collected: QueryRun[] = [];
    let nextHistory = history;
    try {
      for (let index = 0; index < executed.length; index += 1) {
        const original = statements[index]!;
        const payload = isMongo ? mongoPayload(original, queryLimit) : executed[index]!;
        try {
          const result = await databaseApi.executeQuery(selectedId, payload, queryLimit);
          collected.push({ id: `run-${index}`, sql: original, result, error: result.success ? null : result.error ?? "Query failed" });
        } catch (caught) {
          collected.push({ id: `run-${index}`, sql: original, result: null, error: caught instanceof Error ? caught.message : "Query failed" });
        }
        nextHistory = [original, ...nextHistory.filter((item) => item !== original)].slice(0, HISTORY_LIMIT);
      }
    } catch (caught) {
      collected.push({ id: "run-parse", sql: queryText, result: null, error: caught instanceof Error ? caught.message : "Query failed" });
    } finally {
      setRuns(collected);
      setHistory(nextHistory);
      writeStoredHistory({ ...readStoredHistory(), [selectedId]: nextHistory });
      setRunning(false);
    }
  }, [connection?.type, history, queryLimit, queryText, running, selectedId]);

  return {
    queryText, setQueryText, queryLimit, setQueryLimit,
    runs, activeRunIndex, setActiveRunIndex, activeRun: runs[activeRunIndex], running,
    historyOpen, setHistoryOpen, history, useHistoryItem,
    runQuery, explainQuery: () => runQuery("current", true), editorRef,
  };
}

export type QueryEditor = ReturnType<typeof useQueryEditor>;
