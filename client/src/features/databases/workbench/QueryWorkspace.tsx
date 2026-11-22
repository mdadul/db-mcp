import { lazy, Suspense, useEffect, useState, type MutableRefObject } from "react";
import { EditorView } from "@codemirror/view";
import { ChevronDown, Code2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/Skeleton";
import { VirtualDataGrid } from "../components/VirtualDataGrid";
import type { DatabaseConnection } from "../types";
import type { QueryResult } from "./useQueryEditor";

const SqlEditor = lazy(() => import("@uiw/react-codemirror").then((module) => ({ default: module.default })));
const loadSqlLanguage = (schema?: Record<string, Record<string, string[]>>) => import("@codemirror/lang-sql").then((module) => module.sql({ schema }));
const loadJsonLanguage = () => import("@codemirror/lang-json").then((module) => module.json());

/** Read-only SQL (or Mongo JSON) editor with run, history and results. */
export function QueryWorkspace({ connection, schema, queryText, onQueryChange, limit, onLimitChange, onRun, result, error, history, historyOpen, onHistoryOpen, onUseHistory, editorRef, onCopy }: {
  connection: DatabaseConnection;
  schema?: Record<string, Record<string, string[]>>;
  queryText: string;
  onQueryChange: (value: string) => void;
  limit: number;
  onLimitChange: (value: number) => void;
  onRun: () => void;
  result: QueryResult | null;
  error: string | null;
  history: string[];
  historyOpen: boolean;
  onHistoryOpen: (open: boolean) => void;
  onUseHistory: (query: string) => void;
  editorRef: MutableRefObject<{ view?: EditorView } | null>;
  onCopy: (text: string) => void;
}) {
  const mongodb = connection.type === "mongodb";
  const [language, setLanguage] = useState<Awaited<ReturnType<typeof loadSqlLanguage>> | Awaited<ReturnType<typeof loadJsonLanguage>> | null>(null);
  useEffect(() => {
    let mounted = true;
    void (mongodb ? loadJsonLanguage() : loadSqlLanguage(schema)).then((extension) => { if (mounted) setLanguage(extension); });
    return () => { mounted = false; };
  }, [mongodb, schema]);

  const resultRows = result ? { rows: result.rows, columns: result.columns.map((column) => ({ name: column.name, dataType: "" })) } : undefined;
  const queryHistoryBox = historyOpen && <div className="absolute right-2 top-8 z-30 max-h-60 w-[min(420px,90vw)] overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg" role="listbox" aria-label="Query history">{history.length ? history.map((item, index) => <button key={`${index}-${item}`} role="option" className="block w-full truncate rounded px-2 py-1.5 text-left text-code hover:bg-muted" onClick={() => onUseHistory(item)}>{item}</button>) : <p className="px-2 py-3 text-ui-xs text-muted-foreground">Run a query to build history.</p>}</div>;

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="relative flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
      <span className="text-ui-xs text-muted-foreground">{mongodb ? "MongoDB JSON query · { collection, filter, projection, sort, limit }" : "SQL · writes are blocked"}</span>
      <span className="flex-1" />
      <label className="flex items-center gap-1 text-ui-xs text-muted-foreground">Limit<Input type="number" min={1} max={1000} value={limit} onChange={(event) => onLimitChange(Number(event.target.value))} className="h-6 w-16 px-1 text-ui-xs" /></label>
      <div className="relative"><Button variant="outline" size="xs" aria-expanded={historyOpen} onClick={() => onHistoryOpen(!historyOpen)}>History<ChevronDown data-icon="inline-end" /></Button>{queryHistoryBox}</div>
      <Button size="xs" onClick={onRun}><Code2 data-icon="inline-start" />Run <kbd className="ml-1 rounded bg-primary-foreground/15 px-1 text-ui-xs">⌘↵</kbd></Button>
    </div>
    {mongodb && <div className="border-b border-border bg-info-subtle px-3 py-1.5 text-ui-xs text-info">Use a read-only JSON query: <code className="font-mono">{"{\"collection\":\"orders\",\"filter\":{},\"limit\":20}"}</code></div>}
    <div className="min-h-32 shrink-0 border-b border-border" aria-label="Read-only query editor"><Suspense fallback={<div className="p-3" role="status" aria-label="Loading query editor"><Skeleton className="h-32 w-full" /></div>}><SqlEditor value={queryText} height="160px" extensions={[...(language ? [language] : []), EditorView.theme({ ".cm-content, .cm-gutter": { fontFamily: "var(--font-mono)", fontSize: "var(--font-size-code)", fontFeatureSettings: "var(--font-feature-settings)" } })]} onChange={onQueryChange} onCreateEditor={(view) => { editorRef.current = { view }; }} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }} theme={document.documentElement.classList.contains("dark") ? "dark" : "light"} className="font-mono" /></Suspense></div>
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {error && <div className="relative z-30 shrink-0 border-b border-danger/30 bg-danger-subtle px-3 py-2 text-ui-xs text-danger" role="alert"><strong>{error}</strong>{result?.hint && <p className="mt-0.5">{result.hint}</p>}</div>}
      {result?.success && result.truncated && <div className="relative z-30 shrink-0 border-b border-warning/30 bg-warning-subtle px-3 py-1.5 text-ui-xs text-warning" role="status">Results truncated at {limit} rows. {result.hint}</div>}
      {result ? <>
        <VirtualDataGrid rows={resultRows?.rows ?? []} columns={resultRows?.columns ?? []} onSort={() => undefined} direction="asc" onCopy={onCopy} />
        <div className="relative z-30 flex h-7 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-ui-xs text-muted-foreground"><span>{result.rowCount} rows</span><span>{result.executionTimeMs} ms</span>{result.truncated && <span className="text-warning">Truncated</span>}</div>
      </> : !error && <div className="flex min-h-0 flex-1 items-center justify-center text-ui-xs text-muted-foreground">Run a read-only query to see results here.</div>}
    </div>
  </div>;
}
