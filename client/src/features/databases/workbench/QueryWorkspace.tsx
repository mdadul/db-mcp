import { lazy, Suspense, useEffect, useState } from "react";
import { EditorView } from "@codemirror/view";
import { ChevronDown, Code2, Save, Trash2, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/Skeleton";
import { VirtualDataGrid } from "../components/VirtualDataGrid";
import type { DatabaseConnection } from "../types";
import type { QueryEditor, QueryRun } from "./useQueryEditor";
import type { useSavedQueries } from "./useSavedQueries";
import { formatSql, writeKeywordIn } from "./sqlText";

const SqlEditor = lazy(() => import("@uiw/react-codemirror").then((module) => ({ default: module.default })));
const loadSqlLanguage = (schema?: Record<string, Record<string, string[]>>) => import("@codemirror/lang-sql").then((module) => module.sql({ schema }));
const loadJsonLanguage = () => import("@codemirror/lang-json").then((module) => module.json());
const READ_ONLY_ERROR = /read-only|only select|not allowed|blocked/i;

/** Read-only SQL (or Mongo JSON) editor with run, explain, format, saved queries, history and results. */
export function QueryWorkspace({ connection, schema, editor, saved, onCopy }: {
  connection: DatabaseConnection;
  schema?: Record<string, Record<string, string[]>>;
  editor: QueryEditor;
  saved: ReturnType<typeof useSavedQueries>;
  onCopy: (text: string) => void;
}) {
  const mongodb = connection.type === "mongodb";
  const [language, setLanguage] = useState<Awaited<ReturnType<typeof loadSqlLanguage>> | Awaited<ReturnType<typeof loadJsonLanguage>> | null>(null);
  const [historyFilter, setHistoryFilter] = useState("");
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    void (mongodb ? loadJsonLanguage() : loadSqlLanguage(schema)).then((extension) => { if (mounted) setLanguage(extension); });
    return () => { mounted = false; };
  }, [mongodb, schema]);

  const { activeRun } = editor;
  const needle = historyFilter.trim().toLowerCase();
  const visibleHistory = editor.history.filter((item) => item.toLowerCase().includes(needle));
  const result = activeRun?.result ?? null;
  const writeKeyword = activeRun ? writeKeywordIn(activeRun.sql) : null;
  const blocked = Boolean(activeRun?.error && writeKeyword && READ_ONLY_ERROR.test(activeRun.error));

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="relative flex min-h-8 shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1">
      <span className="text-ui-xs text-muted-foreground">{mongodb ? "MongoDB JSON query · { collection, filter, projection, sort, limit }" : "SQL · writes are blocked"}</span>
      <span className="flex-1" />
      <label className="flex items-center gap-1 text-ui-xs text-muted-foreground">Limit<Input type="number" min={1} max={1000} value={editor.queryLimit} onChange={(event) => editor.setQueryLimit(Number(event.target.value))} className="h-6 w-16 px-1 text-ui-xs" /></label>
      <div className="relative">
        <Button variant="outline" size="xs" aria-expanded={editor.historyOpen} onClick={() => { setSavedOpen(false); editor.setHistoryOpen(!editor.historyOpen); }}>History<ChevronDown data-icon="inline-end" /></Button>
        {editor.historyOpen && <div className="absolute right-0 top-8 z-30 flex max-h-72 w-[min(420px,90vw)] flex-col overflow-hidden rounded-md border border-border bg-popover shadow-lg" role="dialog" aria-label="Query history">
          <Input value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} placeholder="Search history" aria-label="Search query history" className="m-1 h-7 text-ui-xs" />
          <div role="listbox" aria-label="Query history results" className="min-h-0 flex-1 overflow-auto p-1">{visibleHistory.length ? visibleHistory.map((item, index) => <button key={`${index}-${item}`} role="option" aria-selected={false} className="block w-full truncate rounded px-2 py-1.5 text-left text-code hover:bg-muted" onClick={() => editor.useHistoryItem(item)}>{item}</button>) : <p className="px-2 py-3 text-ui-xs text-muted-foreground">{editor.history.length ? "No matching queries." : "Run a query to build history."}</p>}</div>
        </div>}
      </div>
      <div className="relative">
        <Button variant="outline" size="xs" aria-expanded={savedOpen} onClick={() => { editor.setHistoryOpen(false); setSavedOpen(!savedOpen); }}>Saved ({saved.items.length})<ChevronDown data-icon="inline-end" /></Button>
        {savedOpen && <div className="absolute right-0 top-8 z-30 max-h-72 w-[min(420px,90vw)] overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg" role="dialog" aria-label="Saved queries">
          {saved.items.length ? saved.items.map((item) => <div key={item.id} className="flex items-center gap-1 rounded hover:bg-muted"><button className="min-w-0 flex-1 px-2 py-1.5 text-left" onClick={() => { editor.setQueryText(item.sql); setSavedOpen(false); }}><span className="block truncate text-ui-xs font-medium">{item.name}</span><span className="block truncate text-code text-muted-foreground">{item.sql}</span></button><Button variant="ghost" size="icon-xs" aria-label={`Delete saved query ${item.name}`} onClick={() => saved.remove(item.id)}><Trash2 /></Button></div>) : <p className="px-2 py-3 text-ui-xs text-muted-foreground">No saved queries for this connection yet.</p>}
        </div>}
      </div>
      {!mongodb && <Button variant="outline" size="xs" aria-label="Format SQL" onClick={() => editor.setQueryText(formatSql(editor.queryText))}><WandSparkles data-icon="inline-start" />Format</Button>}
      {!mongodb && <Button variant="outline" size="xs" aria-label="Explain statement" disabled={editor.running} onClick={() => void editor.explainQuery()}>Explain</Button>}
      <Button variant="outline" size="xs" aria-label="Save query" onClick={() => setSaveName(saveName === null ? "" : null)}><Save data-icon="inline-start" />Save</Button>
      <Button variant="outline" size="xs" aria-label="Run all statements" disabled={editor.running} onClick={() => void editor.runQuery("all")}>Run all <kbd className="ml-1 rounded bg-muted px-1 text-ui-xs">⇧⌘↵</kbd></Button>
      <Button size="xs" aria-label="Run statement" disabled={editor.running} onClick={() => void editor.runQuery()}><Code2 data-icon="inline-start" />{editor.running ? "Running…" : "Run"} <kbd className="ml-1 rounded bg-primary-foreground/15 px-1 text-ui-xs">⌘↵</kbd></Button>
    </div>
    {saveName !== null && <form className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-2 py-1.5" onSubmit={(event) => { event.preventDefault(); const name = saveName.trim(); if (!name) return; saved.save(name, editor.queryText); setSaveName(null); }}>
      <Input autoFocus value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder="Name this query" aria-label="Saved query name" className="h-7 text-ui-xs" />
      <Button type="submit" size="xs" disabled={!saveName.trim()}>Save query</Button>
      <Button type="button" variant="ghost" size="xs" onClick={() => setSaveName(null)}>Cancel</Button>
    </form>}
    {mongodb && <div className="border-b border-border bg-info-subtle px-3 py-1.5 text-ui-xs text-info">Use a read-only JSON query: <code className="font-mono">{"{\"collection\":\"orders\",\"filter\":{},\"limit\":20}"}</code></div>}
    <div className="min-h-32 shrink-0 border-b border-border" aria-label="Read-only query editor"><Suspense fallback={<div className="p-3" role="status" aria-label="Loading query editor"><Skeleton className="h-32 w-full" /></div>}><SqlEditor value={editor.queryText} height="160px" extensions={[...(language ? [language] : []), EditorView.theme({ ".cm-content, .cm-gutter": { fontFamily: "var(--font-mono)", fontSize: "var(--font-size-code)", fontFeatureSettings: "var(--font-feature-settings)" } })]} onChange={editor.setQueryText} onCreateEditor={(view) => { editor.editorRef.current = { view }; }} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }} theme={document.documentElement.classList.contains("dark") ? "dark" : "light"} className="font-mono" /></Suspense></div>
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {editor.runs.length > 1 && <div role="tablist" aria-label="Statement results" className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2">{editor.runs.map((run: QueryRun, index: number) => <button key={run.id} role="tab" aria-selected={index === editor.activeRunIndex} className={`max-w-56 truncate rounded px-2 py-1 text-ui-xs ${index === editor.activeRunIndex ? "bg-accent-subtle font-medium" : "text-muted-foreground hover:bg-muted"} ${run.error ? "text-danger" : ""}`} title={run.sql} onClick={() => editor.setActiveRunIndex(index)}>{index + 1}. {run.error ? "Error" : `${run.result?.rowCount ?? 0} rows`}</button>)}</div>}
      {editor.running && <div className="px-3 py-2 text-ui-xs text-muted-foreground" role="status">Running…</div>}
      {activeRun?.error && <div className="relative z-30 shrink-0 border-b border-danger/30 bg-danger-subtle px-3 py-2 text-ui-xs text-danger" role="alert">
        {blocked ? <><strong>Blocked by read-only mode</strong><p className="mt-0.5">{writeKeyword} changes data, so DB MCP does not run it here. Use a SELECT to inspect data. Change data with your own database tools, using an account that is allowed to write.</p></> : <strong>{activeRun.error}</strong>}
        {result?.hint && !blocked && <p className="mt-0.5">{result.hint}</p>}
      </div>}
      {result?.success && result.truncated && <div className="relative z-30 shrink-0 border-b border-warning/30 bg-warning-subtle px-3 py-1.5 text-ui-xs text-warning" role="status">Results truncated at {editor.queryLimit} rows. {result.hint}</div>}
      {result ? <>
        <VirtualDataGrid rows={result.rows} columns={result.columns.map((column) => ({ name: column.name, dataType: "" }))} onSort={() => undefined} direction="asc" onCopy={onCopy} />
        <div className="relative z-30 flex h-7 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-ui-xs text-muted-foreground"><span>{result.rowCount} rows</span><span>{result.executionTimeMs} ms</span>{result.truncated && <span className="text-warning">Truncated</span>}</div>
      </> : !activeRun?.error && !editor.running && <div className="flex min-h-0 flex-1 items-center justify-center text-ui-xs text-muted-foreground">Run a read-only query to see results here.</div>}
    </div>
  </div>;
}
