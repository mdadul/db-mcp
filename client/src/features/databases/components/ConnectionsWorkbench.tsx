import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type MutableRefObject } from "react";
import { EditorView } from "@codemirror/view";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Code2, Copy, Database, Eye, FolderTree, ListFilter, MoreHorizontal, Plus, RefreshCw, Search, ShieldCheck, Table2 } from "lucide-react";
import { ResizablePanels } from "@/components/ui/ResizablePanels";
import { DocumentTabs, type DocumentTab } from "@/components/ui/DocumentTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusDot } from "@/components/ui/StatusDot";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { VirtualDataGrid, VirtualDataTable } from "./VirtualDataGrid";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DbEngineIcon } from "@/components/brand/DbEngineIcon";
import { useServerInfo } from "@/platform/hooks";
import { databaseApi } from "../api/databaseApi";
import { DB_ENGINES, type BrowseRowsResult, type DatabaseConnection, type SchemaTree, type TableStructure } from "../types";

const SqlEditor = lazy(() => import("@uiw/react-codemirror").then((module) => ({ default: module.default })));
const loadSqlLanguage = (schema?: Record<string, Record<string, string[]>>) => import("@codemirror/lang-sql").then((module) => module.sql({ schema }));
const loadJsonLanguage = () => import("@codemirror/lang-json").then((module) => module.json());

type TabKind = "data" | "structure" | "query";
interface WorkbenchTab { id: string; kind: TabKind; label: string; table?: string; schema?: string; query?: string; }
interface CellSelection { row: number; column: string; value: unknown; }

const STORAGE_KEY = "dbmcp.workbench.v1";
const ACTIVE_TAB_KEY = "dbmcp.workbenchActive.v1";
const QUERY_HISTORY_KEY = "dbmcp.queryHistory.v1";
const PAGE_SIZES = [50, 100, 200, 500] as const;
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const toStatus = (status: string) => status === "enabled" ? "healthy" as const : "neutral" as const;
const formatEstimate = (value: number | null) => value === null ? "" : value.toLocaleString();

/** Database connections and read-only schema/query workbench. */
export function ConnectionsWorkbench() {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(routeId ?? "");
  const [tabsByConnection, setTabsByConnection] = useState<Record<string, WorkbenchTab[]>>(() => readStorage());
  const [activeByConnection, setActiveByConnection] = useState<Record<string, string>>(() => readActiveTabs());
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [schemaFilter, setSchemaFilter] = useState("");
  const [sortMode, setSortMode] = useState<"status" | "engine">("status");
  const [collapsedSchema, setCollapsedSchema] = useState(false);
  const [selectedTable, setSelectedTable] = useState<{ schema: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DatabaseConnection | null>(null);
  const [testStates, setTestStates] = useState<Record<string, "reachable" | "unreachable">>({});
  const [connectionMenu, setConnectionMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const connectionsQuery = useQuery({ queryKey: ["databases"], queryFn: databaseApi.list });
  const connections = connectionsQuery.data ?? [];
  const connection = connections.find((item) => item.id === selectedId);
  const tabs = selectedId ? tabsByConnection[selectedId] ?? [] : [];
  const activeId = selectedId ? activeByConnection[selectedId] ?? tabs[0]?.id : undefined;
  const activeTab = tabs.find((tab) => tab.id === activeId);
  const [debouncedSchemaFilter, setDebouncedSchemaFilter] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSchemaFilter(schemaFilter), 150); return () => window.clearTimeout(timer); }, [schemaFilter]);
  const schemaQuery = useQuery({ queryKey: ["database-schema", selectedId, debouncedSchemaFilter], queryFn: () => databaseApi.getSchemaTree(selectedId, debouncedSchemaFilter || undefined), enabled: Boolean(selectedId && connection?.status === "enabled"), retry: 1, staleTime: 30_000 });
  const structureQuery = useQuery({ queryKey: ["table-structure", selectedId, selectedTable?.schema, selectedTable?.name], queryFn: () => databaseApi.getTableStructure(selectedId, selectedTable?.name ?? "", selectedTable?.schema), enabled: Boolean(selectedId && selectedTable && (activeTab?.kind === "structure" || activeTab?.kind === "data")) });
  const [pageSize, setPageSize] = useState<number>(100);
  const [offset, setOffset] = useState(0);
  const [orderBy, setOrderBy] = useState<string>();
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const rowsQuery = useQuery({ queryKey: ["table-rows", selectedId, selectedTable?.schema, selectedTable?.name, pageSize, offset, orderBy, direction], queryFn: ({ signal }) => databaseApi.browseRows(selectedId, selectedTable?.name ?? "", { schema: selectedTable?.schema, limit: pageSize, offset, orderBy, direction, signal }), enabled: Boolean(selectedId && selectedTable && activeTab?.kind === "data"), placeholderData: (previous) => previous });
  const [queryText, setQueryText] = useState("SELECT 1");
  const [queryLimit, setQueryLimit] = useState(100);
  const [queryResult, setQueryResult] = useState<Awaited<ReturnType<typeof databaseApi.executeQuery>> | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [cell, setCell] = useState<CellSelection | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>(() => selectedId ? readHistoryByConnection()[selectedId] ?? [] : []);
  const queryEditorRef = useRef<{ view?: EditorView } | null>(null);
  const { data: serverInfo } = useServerInfo();
  const [narrowViewport, setNarrowViewport] = useState(() => window.innerWidth < 1100);
  const connectionsForMenu = connectionMenu ? connections.find((item) => item.id === connectionMenu.id) : undefined;
  const toggleStatus = useMutation({ mutationFn: (item: DatabaseConnection) => databaseApi.toggleStatus(item.id, item.status === "enabled" ? "disabled" : "enabled"), onSuccess: async (item) => { await queryClient.invalidateQueries({ queryKey: ["databases"] }); toast.success(`${item.name} ${item.status}`); } });
  const deleteConnection = useMutation({ mutationFn: (item: DatabaseConnection) => databaseApi.delete(item.id), onSuccess: async () => { const deletedId = deleteTarget?.id; await queryClient.invalidateQueries({ queryKey: ["databases"] }); if (deletedId === selectedId) { setSelectedId(""); navigate("/connections", { replace: true }); } setDeleteTarget(null); toast.success("Connection deleted"); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete connection") });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(tabsByConnection)); }, [tabsByConnection]);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 150); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify(activeByConnection)); }, [activeByConnection]);
  useEffect(() => { if (routeId && routeId !== selectedId) setSelectedId(routeId); }, [routeId, selectedId]);
  useEffect(() => { if (selectedId && !routeId) navigate(`/connections/${selectedId}`, { replace: true }); }, [selectedId, routeId, navigate]);
  useEffect(() => { if (selectedId) setQueryHistory(readHistoryByConnection()[selectedId] ?? []); }, [selectedId]);
  useEffect(() => { if (activeTab?.kind === "query") setQueryText(activeTab.query ?? defaultQuery(connection)); }, [activeTab?.id, connection?.id, connection?.type]);
  useEffect(() => { if (connection && tabs.length === 0) { const first: WorkbenchTab = { id: `query-${connection.id}`, kind: "query", label: "Query 1", query: defaultQuery(connection) }; setTabsByConnection((current) => ({ ...current, [connection.id]: [first] })); setActiveByConnection((current) => ({ ...current, [connection.id]: first.id })); } }, [connection, tabs.length]);
  useEffect(() => { setQueryResult(null); setQueryError(null); setCell(null); }, [activeId, selectedId]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "f") { event.preventDefault(); searchRef.current?.focus(); }
      if (mod && event.key.toLowerCase() === "t") { event.preventDefault(); openQueryTab(); }
      if (mod && event.key.toLowerCase() === "w" && activeId) { event.preventDefault(); closeTab(activeId); }
      if (mod && event.key === "Enter" && activeTab?.kind === "query") { event.preventDefault(); void runQuery(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  useEffect(() => { const resize = () => setNarrowViewport(window.innerWidth < 1100); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  useEffect(() => { if (narrowViewport) setCollapsedSchema(true); }, [narrowViewport]);
  useEffect(() => { if (!connectionMenu) return; const close = () => setConnectionMenu(null); window.addEventListener("click", close); window.addEventListener("keydown", close); return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", close); }; }, [connectionMenu]);

  const visibleConnections = useMemo(() => connections.filter((item) => `${item.name} ${item.host} ${item.databaseName} ${item.type}`.toLocaleLowerCase().includes(debouncedSearch.toLocaleLowerCase())).sort((a, b) => sortMode === "engine" ? a.type.localeCompare(b.type) || a.name.localeCompare(b.name) : a.status.localeCompare(b.status) || a.name.localeCompare(b.name)), [connections, debouncedSearch, sortMode]);
  const openTab = useCallback((kind: TabKind, table?: { schema: string; name: string }, query?: string) => {
    if (!selectedId) return;
    const currentTabs = tabsByConnection[selectedId] ?? [];
    const existing = table ? currentTabs.find((tab) => (tab.kind === kind || tab.kind === "data" || tab.kind === "structure") && tab.schema === table.schema && tab.table === table.name) : undefined;
    const nextTab: WorkbenchTab = existing ?? { id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, label: kind === "query" ? `Query ${currentTabs.filter((tab) => tab.kind === "query").length + 1}` : table?.name ?? (kind === "data" ? "Data" : "Structure"), ...(table ? { table: table.name, schema: table.schema } : {}), ...(kind === "query" ? { query: query ?? defaultQuery(connection) } : {}) };
    if (!existing) setTabsByConnection((current) => ({ ...current, [selectedId]: [...(current[selectedId] ?? []), nextTab] }));
    else if (existing.kind !== kind) setTabsByConnection((current) => ({ ...current, [selectedId]: (current[selectedId] ?? []).map((tab) => tab.id === existing.id ? { ...tab, kind } : tab) }));
    setActiveByConnection((current) => ({ ...current, [selectedId]: nextTab.id }));
    if (table) setSelectedTable(table);
    setCell(null);
  }, [connection, selectedId, tabsByConnection]);
  const openQueryTab = useCallback((query?: string) => { openTab("query", undefined, query); if (query) setQueryText(query); }, [openTab]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("analystQuery") !== "1" || !routeId || connection?.id !== routeId) return;
    try {
      const request: unknown = JSON.parse(sessionStorage.getItem("dbmcp.analyst.openQuery") ?? "null");
      if (request && typeof request === "object" && "databaseId" in request && request.databaseId === routeId && "sql" in request && typeof request.sql === "string") {
        sessionStorage.removeItem("dbmcp.analyst.openQuery");
        openQueryTab(request.sql);
      }
    } catch { sessionStorage.removeItem("dbmcp.analyst.openQuery"); }
    params.delete("analystQuery");
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : "" }, { replace: true });
  }, [location.pathname, location.search, routeId, connection?.id, openQueryTab, navigate]);
  const closeTab = (tabId: string) => {
    if (!selectedId) return;
    const currentTabs = tabsByConnection[selectedId] ?? [];
    const next = currentTabs.filter((tab) => tab.id !== tabId);
    setTabsByConnection((current) => ({ ...current, [selectedId]: next }));
    if (activeId === tabId) setActiveByConnection((current) => ({ ...current, [selectedId]: next.at(-1)?.id ?? "" }));
  };
  const handleSelectConnection = (item: DatabaseConnection) => {
    setSelectedId(item.id);
    setSelectedTable(null);
    setOffset(0);
    navigate(`/connections/${item.id}`, { replace: true });
    const existing = tabsByConnection[item.id] ?? [];
    if (!existing.length) {
      const first: WorkbenchTab = { id: `query-${Date.now()}`, kind: "query", label: "Query 1", query: defaultQuery(item) };
      setTabsByConnection((current) => ({ ...current, [item.id]: [first] }));
      setActiveByConnection((current) => ({ ...current, [item.id]: first.id }));
    }
  };
  const selectTable = useCallback((schema: string, name: string, kind: "data" | "structure") => {
    setSelectedTable({ schema, name });
    setOffset(0);
    openTab(kind, { schema, name });
  }, [openTab]);
  const runConnectionTest = async (item: DatabaseConnection) => {
    try { const result = await databaseApi.testConnection(item.id); setTestStates((current) => ({ ...current, [item.id]: result.success ? "reachable" : "unreachable" })); toast[result.success ? "success" : "error"](result.message, { description: result.hint }); }
    catch (error) { setTestStates((current) => ({ ...current, [item.id]: "unreachable" })); toast.error(error instanceof Error ? error.message : "Connection test failed"); }
  };
  const copy = async (text: string, label: string) => { try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); } catch { toast.error(`Could not copy ${label.toLocaleLowerCase()}`); } };
  const copyConnectionUrl = async (item: DatabaseConnection) => { try { const result = await databaseApi.getConnectionString(item.id); await copy(result.url, "Masked connection URL"); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load connection URL"); } };
  const openTableQuery = (schema: string, table: string) => {
    openQueryTab(connection?.type === "mongodb" ? JSON.stringify({ collection: table, filter: {}, limit: 100 }, null, 2) : `SELECT * FROM ${connection?.type === "sqlite" ? quoteIdentifier(table) : `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`} LIMIT 100`);
  };

  async function runQuery() {
    if (!selectedId || !queryText.trim()) return;
    const selected = queryEditorRef.current?.view?.state.selection.main;
    const selection = selected && selected.from !== selected.to ? queryEditorRef.current?.view?.state.doc.sliceString(selected.from, selected.to) : "";
    const query = selection || queryText;
    setQueryError(null); setQueryResult(null);
    try {
      const mongoQuery = connection?.type === "mongodb" ? (() => { const dsl: unknown = JSON.parse(query); if (typeof dsl !== "object" || dsl === null || Array.isArray(dsl)) throw new Error("Enter a JSON object with a collection field."); return JSON.stringify({ ...dsl, limit: queryLimit }); })() : query;
      const result = await databaseApi.executeQuery(selectedId, mongoQuery, queryLimit);
      setQueryResult(result);
      if (!result.success) setQueryError(result.error ?? "Query failed");
      setQueryHistory((current) => { const next = [query, ...current.filter((item) => item !== query)].slice(0, 50); localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify({ ...readHistoryByConnection(), [selectedId]: next })); return next; });
    } catch (error) { setQueryError(error instanceof Error ? error.message : "Query failed"); }
  }

  const queryRows = queryResult ? { rows: queryResult.rows, columns: queryResult.columns.map((column) => ({ name: column.name, dataType: "" })), executionTimeMs: queryResult.executionTimeMs, hasMore: queryResult.truncated, offset: 0, limit: queryLimit } : undefined;
  const languageSchema = schemaQuery.data ? Object.fromEntries(schemaQuery.data.schemas.map((schema) => [schema.name, Object.fromEntries(schema.tables.map((table) => [table.name, table.name === selectedTable?.name ? structureQuery.data?.columns.map((column) => column.name) ?? [] : []]))])) : undefined;
  const connectionsPane = <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-border bg-surface" aria-label="Connections pane">
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2"><span className="flex-1 text-caption font-semibold">Connections</span><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Group connections"><ListFilter /></Button>} /><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setSortMode("status")}>Group by status</DropdownMenuItem><DropdownMenuItem onClick={() => setSortMode("engine")}>Group by engine</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button variant="ghost" size="icon-xs" aria-label="Add connection" onClick={() => navigate("/connections/new")}><Plus /></Button></div>
    <label className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2 text-muted-foreground"><Search className="size-3.5" /><Input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter connections…  ⌘F" className="h-7 border-0 bg-transparent px-0 text-caption shadow-none focus-visible:ring-0" /></label>
    <div role="listbox" aria-label="Database connections" className="min-h-0 flex-1 overflow-y-auto p-1">
    {connectionsQuery.isLoading ? <div className="space-y-2 p-2" role="status" aria-label="Loading connections">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-11 w-full" key={index} />)}</div> : connectionsQuery.isError ? <div className="p-3 text-caption text-danger" role="alert">{connectionsQuery.error.message}<Button variant="ghost" size="xs" onClick={() => void connectionsQuery.refetch()}>Retry</Button></div> : visibleConnections.length === 0 ? <EmptyState title={connections.length ? "No matching connections" : "No connections yet"} description={connections.length ? "Change the search to see other connections." : "Add a database to browse its schema and run read-only queries."} action={!connections.length ? <Button size="sm" onClick={() => navigate("/connections/new")}><Plus data-icon="inline-start" />Add connection</Button> : undefined} /> : <>
        {groupedConnections(visibleConnections, sortMode).map(([group, items]) => <div key={group}><p className="px-2 pb-1 pt-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>{items.map((item) => <ConnectionRow key={item.id} item={item} selected={selectedId === item.id} testState={testStates[item.id]} onSelect={() => handleSelectConnection(item)} onMenu={(event) => { event.preventDefault(); event.stopPropagation(); setConnectionMenu({ id: item.id, x: event.clientX, y: event.clientY }); }} onContextMenu={(event) => { event.preventDefault(); setConnectionMenu({ id: item.id, x: event.clientX, y: event.clientY }); }} />)}</div>)}
      </>}
    </div>
  </section>;

  const schemaPane = <section className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-border bg-surface ${collapsedSchema ? "hidden" : ""}`} aria-label="Database schema pane">
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2"><span className="flex-1 text-caption font-semibold">Schema</span>{connection && <Button variant="ghost" size="icon-xs" aria-label="Refresh schema" title="Refresh schema" onClick={() => void schemaQuery.refetch()}><RefreshCw /></Button>}<Button variant="ghost" size="icon-xs" aria-label="Collapse schema pane" onClick={() => setCollapsedSchema(true)}><ChevronDown className="rotate-90" /></Button></div>
    {!connection ? <EmptyState title="Select a connection" description="Choose a database to inspect its tables and views." /> : connection.status === "disabled" ? <div className="m-2 rounded-md border border-warning/30 bg-warning-subtle p-3 text-caption" role="status">This connection is disabled. <button className="font-medium text-primary underline" onClick={() => toggleStatus.mutate(connection)}>Enable to load schema</button></div> : <>
      <label className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2 text-muted-foreground"><Search className="size-3.5" /><Input value={schemaFilter} onChange={(event) => setSchemaFilter(event.target.value)} placeholder="Filter tables…" className="h-7 border-0 bg-transparent px-0 text-caption shadow-none focus-visible:ring-0" /></label>
      {schemaQuery.isLoading ? <div className="space-y-2 p-2" role="status" aria-label="Loading schema">{Array.from({ length: 8 }, (_, index) => <Skeleton className="h-6 w-full" key={index} />)}</div> : schemaQuery.isError ? <div className="p-3 text-caption text-danger" role="alert">{schemaQuery.error.message}<Button variant="ghost" size="xs" onClick={() => void schemaQuery.refetch()}>Retry</Button></div> : schemaQuery.data?.schemas.length ? <SchemaTreePane connectionId={selectedId} tree={schemaQuery.data} selectedTable={selectedTable} onOpenData={(schema, table) => selectTable(schema, table, "data")} onOpenStructure={(schema, table) => selectTable(schema, table, "structure")} onQuery={openTableQuery} onCopy={(value) => void copy(value, "Name")} /> : <EmptyState title="No tables found" description={schemaFilter ? "Try a different filter." : "This database has no visible tables or collections."} />}
    </>}
  </section>;

  const mainPane = <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background" aria-label="Database workbench">
    {connection && <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3"><DbEngineIcon type={connection.type} className="size-4" /><span className="max-w-52 truncate text-secondary font-semibold">{connection.name}</span><span className="rounded border border-border px-1.5 py-0.5 text-caption uppercase text-muted-foreground">{connection.type}</span><StatusDot state={testStates[connection.id] === "reachable" ? "healthy" : testStates[connection.id] === "unreachable" ? "error" : toStatus(connection.status)} /><span className="flex-1" /><Button variant="ghost" size="xs" onClick={() => void runConnectionTest(connection)}>Test</Button><Button variant="ghost" size="xs" onClick={() => navigate(`/connections/${connection.id}/edit`)}>Edit</Button><Button variant="ghost" size="xs" onClick={() => openQueryTab()}><Plus data-icon="inline-start" />Query</Button><Button variant="ghost" size="icon-xs" aria-label="Refresh schema" onClick={() => void schemaQuery.refetch()}><RefreshCw /></Button>{collapsedSchema && <Button variant="outline" size="xs" onClick={() => setCollapsedSchema(false)}><FolderTree data-icon="inline-start" />Schema</Button>}</div>}
    {connection?.status === "disabled" && <div className="flex shrink-0 items-center justify-between border-b border-warning/30 bg-warning-subtle px-3 py-2 text-secondary" role="status"><span>This connection is disabled. Enable it to browse or query this database.</span><Button variant="outline" size="xs" onClick={() => toggleStatus.mutate(connection)}>Enable</Button></div>}
    {!connection ? <EmptyState title="Select a connection" description="Choose a database from the left pane, then open a table or start a query." icon={<Database className="size-7" />} action={<Button size="sm" onClick={() => navigate("/connections/new")}><Plus data-icon="inline-start" />Add connection</Button>} /> : <>
      <div className="relative z-30 flex min-h-(--control-h-lg) min-w-0 shrink-0 items-end overflow-hidden border-b border-border"><DocumentTabs tabs={tabs as DocumentTab[]} activeId={activeId} onSelect={(tabId) => { setActiveByConnection((current) => ({ ...current, [connection.id]: tabId })); const selected = tabs.find((tab) => tab.id === tabId); setSelectedTable(selected?.table ? { schema: selected.schema ?? "", name: selected.table } : null); }} onClose={closeTab} className="min-w-0 flex-1 px-2" /><Button variant="ghost" size="icon-xs" aria-label="New query tab" title="New query (⌘T)" className="mb-1 mr-1" onClick={() => openQueryTab()}><Plus /></Button></div>
      {!activeTab ? <EmptyState title="Open a table or query" description="Choose an object in the schema pane or create a query tab." action={<Button size="sm" onClick={() => openQueryTab()}>New query</Button>} /> : activeTab.kind === "query" ? <QueryWorkspace connection={connection} schema={languageSchema} queryText={queryText} onQueryChange={(value) => { setQueryText(value); setTabsByConnection((current) => ({ ...current, [connection.id]: (current[connection.id] ?? []).map((tab) => tab.id === activeTab.id ? { ...tab, query: value } : tab) })); }} limit={queryLimit} onLimitChange={setQueryLimit} onRun={() => void runQuery()} result={queryResult} error={queryError} history={queryHistory} historyOpen={historyOpen} onHistoryOpen={setHistoryOpen} onUseHistory={(query) => { setQueryText(query); setTabsByConnection((current) => ({ ...current, [connection.id]: (current[connection.id] ?? []).map((tab) => tab.id === activeTab.id ? { ...tab, query } : tab) })); setHistoryOpen(false); }} editorRef={queryEditorRef} onCopy={(text) => void copy(text, "Query results")} /> : activeTab.kind === "structure" ? <StructureView query={structureQuery} onOpenTable={(schema, table) => selectTable(schema, table, "data")} /> : <DataWorkspace query={rowsQuery} table={activeTab.table ?? ""} pageSize={pageSize} onPageSize={(size) => { setPageSize(size); setOffset(0); }} offset={offset} onOffset={setOffset} orderBy={orderBy} direction={direction} onSort={(column) => { setOrderBy(column); setDirection((current) => orderBy === column ? current === "asc" ? "desc" : "asc" : "asc"); }} selectedCell={cell} onSelectCell={setCell} onCopy={(text) => void copy(text, "Cell")} />}
    </>}
  </section>;

  return <div className="relative h-full min-h-0 min-w-0 overflow-hidden" onClick={() => connectionMenu && setConnectionMenu(null)}>
    {narrowViewport ? <div className="flex h-full min-h-0 min-w-0"><div className="w-56 min-w-44 shrink-0">{connectionsPane}</div><div className="min-h-0 min-w-0 flex-1">{mainPane}</div>{!collapsedSchema && connection && <div className="absolute inset-y-0 left-56 z-30 w-[min(320px,75vw)] border-r border-border bg-surface shadow-xl">{schemaPane}</div>}</div> : <ResizablePanels id="connections-workbench" className="h-full" panels={[
      { id: "connections", defaultSize: 20, minSize: 14, maxSize: 28, content: connectionsPane },
      { id: "schema", defaultSize: 24, minSize: 14, maxSize: 35, content: schemaPane },
      { id: "main", defaultSize: 56, minSize: 35, content: mainPane },
    ]} />}
    {connectionMenu && connectionsForMenu && <ConnectionContextMenu item={connectionsForMenu} point={connectionMenu} onOpen={() => handleSelectConnection(connectionsForMenu)} onEdit={() => navigate(`/connections/${connectionsForMenu.id}/edit`)} onTest={() => void runConnectionTest(connectionsForMenu)} onDuplicate={async () => { try { const duplicate = await databaseApi.duplicate(connectionsForMenu.id); await queryClient.invalidateQueries({ queryKey: ["databases"] }); toast.success(`Duplicated as ${duplicate.name}`); navigate(`/connections/${duplicate.id}/edit?duplicate=1`); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not duplicate connection"); } }} onCopyUrl={() => void copyConnectionUrl(connectionsForMenu)} onCopyMcp={() => void copy(JSON.stringify({ mcpServers: { "db-mcp": { url: serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp" } } }, null, 2), `${connectionsForMenu.name} MCP config`)} onToggle={() => toggleStatus.mutate(connectionsForMenu)} onDelete={() => setDeleteTarget(connectionsForMenu)} />}
    <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} title="Delete connection?" description={`This removes “${deleteTarget?.name ?? "connection"}” from this computer and disconnects AI clients from it.`} confirmLabel="Delete connection" pending={deleteConnection.isPending} onConfirm={() => { if (deleteTarget) deleteConnection.mutate(deleteTarget); }} />
  </div>;
}

function readStorage(): Record<string, WorkbenchTab[]> {
  try { const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); if (typeof value === "object" && value !== null) return value as Record<string, WorkbenchTab[]>; } catch { /* Start with empty document tabs. */ }
  return {};
}
function readHistoryByConnection(): Record<string, string[]> {
  try { const value: unknown = JSON.parse(localStorage.getItem(QUERY_HISTORY_KEY) ?? "{}"); if (typeof value === "object" && value !== null) return value as Record<string, string[]>; } catch { /* Start with empty query history. */ }
  return {};
}
function readActiveTabs(): Record<string, string> {
  try { const value: unknown = JSON.parse(localStorage.getItem(ACTIVE_TAB_KEY) ?? "{}"); if (typeof value === "object" && value !== null) return value as Record<string, string>; } catch { /* Start with no remembered active tab. */ }
  return {};
}
function defaultQuery(connection: DatabaseConnection | undefined): string { return connection?.type === "mongodb" ? '{"collection":"collection_name","filter":{},"limit":100}' : "SELECT 1"; }

function groupedConnections(items: DatabaseConnection[], mode: "status" | "engine"): [string, DatabaseConnection[]][] {
  const groups = new Map<string, DatabaseConnection[]>();
  for (const item of items) {
    const label = mode === "status" ? item.status === "enabled" ? "Enabled" : "Disabled" : DB_ENGINES.find((engine) => engine.type === item.type)?.label ?? item.type;
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups];
}

function ConnectionRow({ item, selected, testState, onSelect, onMenu, onContextMenu }: { item: DatabaseConnection; selected: boolean; testState?: "reachable" | "unreachable"; onSelect: () => void; onMenu: (event: MouseEvent<HTMLButtonElement>) => void; onContextMenu: (event: MouseEvent<HTMLDivElement>) => void }) {
  const state = testState === "reachable" ? "healthy" : testState === "unreachable" ? "error" : item.status === "disabled" ? "neutral" : "warning";
  return <div role="option" aria-selected={selected} aria-label={`${item.name}, ${item.status === "disabled" ? "disabled" : testState ?? "untested"}`} tabIndex={0} onClick={onSelect} onContextMenu={onContextMenu} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const rows = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role='option']") ?? [])]; const index = rows.indexOf(event.currentTarget); rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus(); } }} className={`group flex h-12 min-w-0 cursor-default items-center gap-2 rounded px-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-accent-subtle text-foreground" : "text-muted-foreground"}`}>
    <DbEngineIcon type={item.type} className="size-4 shrink-0" /><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="min-w-0 truncate text-secondary font-medium text-foreground">{item.name}</span><span title={item.status === "disabled" ? "Disabled" : testState ?? "Untested"}><StatusDot state={testState ? state : item.status === "disabled" ? "neutral" : "warning"} /></span></div><p className="truncate text-caption text-muted-foreground">{item.type === "sqlite" ? item.databaseName : `${item.host}:${item.port} · ${item.databaseName}`}</p></div><Button variant="ghost" size="icon-xs" aria-label={`Actions for ${item.name}`} onClick={onMenu}><MoreHorizontal /></Button>
  </div>;
}

function ConnectionContextMenu({ item, point, onOpen, onEdit, onTest, onDuplicate, onCopyUrl, onCopyMcp, onToggle, onDelete }: { item: DatabaseConnection; point: { x: number; y: number }; onOpen: () => void; onEdit: () => void; onTest: () => void; onDuplicate: () => void; onCopyUrl: () => void; onCopyMcp: () => void; onToggle: () => void; onDelete: () => void }) {
  const style = { left: Math.min(point.x, window.innerWidth - 220), top: Math.min(point.y, window.innerHeight - 280) };
  return <div role="menu" aria-label={`${item.name} actions`} style={style} className="fixed z-50 min-w-52 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg" onClick={(event) => event.stopPropagation()}>{[["Open", onOpen], ["Edit", onEdit], ["Test connection", onTest], ["Duplicate", onDuplicate], ["Copy connection URL", onCopyUrl], ["Copy MCP config", onCopyMcp], [item.status === "enabled" ? "Disable" : "Enable", onToggle], ["Delete", onDelete]].map(([label, action]) => <button key={String(label)} role="menuitem" className={`flex h-7 w-full items-center rounded px-2 text-left text-secondary hover:bg-muted ${label === "Delete" ? "text-danger" : ""}`} onClick={() => (action as () => void)()}>{String(label)}</button>)}</div>;
}

function SchemaTreePane({ connectionId, tree, selectedTable, onOpenData, onOpenStructure, onQuery, onCopy }: { connectionId: string; tree: SchemaTree; selectedTable: { schema: string; name: string } | null; onOpenData: (schema: string, table: string) => void; onOpenStructure: (schema: string, table: string) => void; onQuery: (schema: string, table: string) => void; onCopy: (value: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.schemas.map((schema) => schema.name)));
  const [menu, setMenu] = useState<{ schema: string; table: string; x: number; y: number } | null>(null);
  return <div role="tree" aria-label="Database schema" className="min-h-0 flex-1 overflow-auto p-1">{tree.schemas.map((schema) => <div key={schema.name}><button role="treeitem" aria-expanded={expanded.has(schema.name)} className="flex h-7 w-full items-center gap-1 rounded px-2 text-left text-caption font-medium hover:bg-muted" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(schema.name)) next.delete(schema.name); else next.add(schema.name); return next; })}><ChevronRight className={`size-3 transition-transform ${expanded.has(schema.name) ? "rotate-90" : ""}`} /><FolderTree className="size-3.5 text-muted-foreground" />{schema.name}<span className="ml-auto text-caption text-muted-foreground">{schema.tables.length}</span></button>{expanded.has(schema.name) && schema.tables.map((table) => <SchemaTableRow key={`${schema.name}.${table.name}`} connectionId={connectionId} schema={schema.name} table={table} selected={selectedTable?.schema === schema.name && selectedTable.name === table.name} onOpenData={onOpenData} onOpenStructure={onOpenStructure} onContextMenu={(event) => { event.preventDefault(); setMenu({ schema: schema.name, table: table.name, x: event.clientX, y: event.clientY }); }} />)}</div>)}{menu && <div role="menu" className="fixed z-50 min-w-40 rounded-md border border-border bg-popover p-1 shadow-lg" style={{ left: Math.min(menu.x, window.innerWidth - 180), top: Math.min(menu.y, window.innerHeight - 150) }}><ContextItem label="Open data" action={() => onOpenData(menu.schema, menu.table)} /><ContextItem label="Open structure" action={() => onOpenStructure(menu.schema, menu.table)} /><ContextItem label="New query here" action={() => onQuery(menu.schema, menu.table)} /><ContextItem label="Copy name" action={() => onCopy(menu.table)} /></div>}</div>;
}
function SchemaTableRow({ connectionId, schema, table, selected, onOpenData, onOpenStructure, onContextMenu }: { connectionId: string; schema: string; table: SchemaTree["schemas"][number]["tables"][number]; selected: boolean; onOpenData: (schema: string, table: string) => void; onOpenStructure: (schema: string, table: string) => void; onContextMenu: (event: MouseEvent<HTMLDivElement>) => void }) {
  const [expanded, setExpanded] = useState(false);
  const structure = useQuery({ queryKey: ["table-structure", connectionId, schema, table.name], queryFn: () => databaseApi.getTableStructure(connectionId, table.name, schema), enabled: expanded });
  const openColumns = (event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); setExpanded((current) => !current); };
  return <div className="min-w-0 overflow-hidden"><div role="treeitem" aria-selected={selected} aria-expanded={expanded} tabIndex={0} className={`group flex h-7 min-w-0 items-center gap-1 overflow-hidden rounded pr-1 text-caption outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-accent-subtle" : ""}`} style={{ paddingLeft: 26 }} onClick={() => onOpenData(schema, table.name)} onDoubleClick={() => onOpenStructure(schema, table.name)} onContextMenu={onContextMenu} onKeyDown={(event) => { if (event.key === "Enter") onOpenData(schema, table.name); else if (event.key === "ArrowRight") void openColumns(event as unknown as MouseEvent<HTMLButtonElement>); }}><button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${table.name} columns`} className="flex size-4 shrink-0 items-center justify-center rounded hover:bg-background" onClick={(event) => void openColumns(event)}><ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} /></button><Table2 className="size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate" title={table.name}>{table.name}</span><span className="shrink-0 text-caption tabular-nums text-muted-foreground">{formatEstimate(table.rowEstimate)}</span></div>{expanded && <div className="relative overflow-hidden">{structure.isLoading ? <Skeleton className="ml-12 my-1 h-5 w-3/4" /> : structure.isError ? <p className="pl-12 py-1 text-caption text-danger">Could not load columns</p> : structure.data?.columns.map((column) => <div key={column.name} className="flex h-6 min-w-0 items-center gap-1 overflow-hidden pl-12 text-caption text-muted-foreground"><span className="min-w-0 flex-1 truncate font-mono">{column.name}</span><span className="max-w-24 truncate">{column.dataType}</span><span className="w-7 shrink-0 text-center" title={column.isPrimaryKey ? "Primary key" : column.nullable ? "Nullable" : "Not nullable"}>{column.isPrimaryKey ? "PK" : column.nullable ? "" : "•"}</span></div>)}</div>}</div>;
}
function ContextItem({ label, action }: { label: string; action: () => void }) { return <button role="menuitem" className="flex h-7 w-full items-center rounded px-2 text-left text-caption hover:bg-muted" onClick={(event) => { event.stopPropagation(); action(); }}>{label}</button>; }

function DataWorkspaceLegacy({ query, table, pageSize, onPageSize, offset, onOffset, orderBy, direction, onSort, selectedCell, onSelectCell, onCopy }: { query: UseQueryResult<BrowseRowsResult>; table: string; pageSize: number; onPageSize: (size: number) => void; offset: number; onOffset: (offset: number) => void; orderBy?: string; direction: "asc" | "desc"; onSort: (column: string) => void; selectedCell: CellSelection | null; onSelectCell: (cell: CellSelection | null) => void; onCopy: (value: string) => void }) {
  const rows = query.data?.rows ?? [];
  const columns = query.data?.columns ?? [];
  return <div className="flex min-h-0 flex-1 flex-col"><div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 text-caption"><span className="font-medium">{table}</span><span className="text-muted-foreground">{query.data?.executionTimeMs ?? 0} ms</span><span className="flex-1" /><Button variant="ghost" size="xs" disabled={!selectedCell} onClick={() => selectedCell && onCopy(cellText(selectedCell.value))}><Copy data-icon="inline-start" />Copy cell</Button></div>{query.isLoading ? <div className="space-y-2 p-3" role="status" aria-label="Loading rows">{Array.from({ length: 8 }, (_, index) => <Skeleton className="h-6 w-full" key={index} />)}</div> : query.isError ? <ErrorPanel message={query.error.message} retry={() => void query.refetch()} /> : <><div className="min-h-0 flex-1 overflow-auto" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selectedCell) { event.preventDefault(); onCopy(cellText(selectedCell.value)); } }}><VirtualGrid rows={rows} columns={columns} onSort={onSort} orderBy={orderBy} direction={direction} onSelectCell={(selection) => { onSelectCell(selection); if (selection) void navigator.clipboard.writeText(cellText(selection.value)).catch(() => undefined); }} /></div><div className="flex h-8 shrink-0 items-center gap-3 border-t border-border px-3 text-caption text-muted-foreground"><span>Rows {rows.length ? offset + 1 : 0}–{offset + rows.length}</span><label className="ml-auto flex items-center gap-1">Page size<select aria-label="Rows per page" value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} className="h-6 rounded border border-border bg-surface px-1 text-caption text-foreground">{PAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}</select></label><Button variant="outline" size="xs" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - pageSize))}>Previous</Button><Button variant="outline" size="xs" disabled={!query.data?.hasMore} onClick={() => onOffset(offset + pageSize)}>Next</Button><span>{query.data?.executionTimeMs ?? 0} ms</span></div></>}</div>;
}

function DataWorkspace({ query, table: _table, pageSize, onPageSize, onOffset, orderBy, direction, onSort, onCopy }: { query: UseQueryResult<BrowseRowsResult>; table: string; pageSize: number; onPageSize: (size: number) => void; offset: number; onOffset: (offset: number) => void; orderBy?: string; direction: "asc" | "desc"; onSort: (column: string) => void; selectedCell: CellSelection | null; onSelectCell: (cell: CellSelection | null) => void; onCopy: (value: string) => void }) {
  return <VirtualDataTable data={query.data} isLoading={query.isLoading} error={query.isError ? query.error.message : undefined} onRetry={() => void query.refetch()} pageSize={pageSize} onPageSize={onPageSize} onOffset={onOffset} onSort={onSort} orderBy={orderBy} direction={direction} onCopy={onCopy} />;
}

function VirtualGrid({ rows, columns, onSort, orderBy, direction, onSelectCell }: { rows: Record<string, unknown>[]; columns: { name: string; dataType: string }[]; onSort: (column: string) => void; orderBy?: string; direction: "asc" | "desc"; onSelectCell: (cell: CellSelection | null) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowHeight = gridRowHeight();
  const rowVirtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => rowHeight, overscan: 10 });
  const visibleColumns = columns.length ? columns : Object.keys(rows[0] ?? {}).map((name) => ({ name, dataType: "" }));
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<{ column: string; x: number; width: number } | null>(null);
  const [inspectedCell, setInspectedCell] = useState<CellSelection | null>(null);
  const totalWidth = visibleColumns.reduce((sum, column) => sum + (widths[column.name] ?? 180), 44);
  return <div className="flex h-full min-h-0 min-w-0"><div ref={parentRef} className="min-h-0 min-w-0 flex-1 overflow-auto" role="grid" aria-label="Database rows"><table className="border-separate border-spacing-0 text-code" style={{ width: totalWidth, minWidth: "100%" }}><thead className="sticky top-0 z-10 bg-muted"><tr><th className="sticky left-0 z-20 w-11 border-b border-r border-border bg-muted px-2 text-right font-normal text-muted-foreground">#</th>{visibleColumns.map((column) => <th key={column.name} style={{ width: widths[column.name] ?? 180 }} className="relative border-b border-r border-border p-0 text-left font-medium"><button type="button" onClick={() => onSort(column.name)} className="flex min-h-(--row-h) w-full items-center gap-1 truncate px-2 hover:bg-accent-subtle" title={`${column.name}${column.dataType ? ` · ${column.dataType}` : ""}`}>{column.name}{orderBy === column.name && <span aria-label={direction === "asc" ? "ascending" : "descending"}>{direction === "asc" ? "↑" : "↓"}</span>}</button><span role="separator" aria-label={`Resize ${column.name} column`} tabIndex={0} className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary focus-visible:bg-primary" onPointerDown={(event) => setDrag({ column: column.name, x: event.clientX, width: widths[column.name] ?? 180 })} onPointerMove={(event) => { if (drag?.column === column.name && event.buttons === 1) setWidths((current) => ({ ...current, [column.name]: Math.max(70, drag.width + event.clientX - drag.x) })); }} onPointerUp={() => setDrag(null)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setWidths((current) => ({ ...current, [column.name]: Math.max(70, (current[column.name] ?? 180) + (event.key === "ArrowRight" ? 16 : -16)) })); } }} /></th>)}</tr></thead><tbody style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>{rowVirtualizer.getVirtualItems().map((virtualRow) => { const row = rows[virtualRow.index] ?? {}; return <tr key={virtualRow.key} className="absolute left-0 flex w-full hover:bg-muted/70" style={{ top: 0, height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}><td className="sticky left-0 z-[1] flex w-11 shrink-0 items-center justify-end border-b border-r border-border bg-surface px-2 text-caption text-muted-foreground">{virtualRow.index + 1}</td>{visibleColumns.map((column) => { const value = row[column.name]; const isNull = value === null || value === undefined; const text = isNull ? "NULL" : cellText(value); const long = text.length > 200 || typeof value === "object"; return <td key={column.name} style={{ width: widths[column.name] ?? 180 }} className={`flex shrink-0 items-center overflow-hidden border-b border-r border-border px-2 ${isNull ? "text-muted-foreground italic" : "text-foreground"}`}><button type="button" className="w-full truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" title={long ? "Select to inspect the full value" : text} onClick={() => { const selected = { row: virtualRow.index, column: column.name, value }; setInspectedCell(selected); onSelectCell(selected); }}>{long ? `${text.slice(0, 180)}…` : text}</button></td>; })}</tr>; })}</tbody></table>{rows.length === 0 && <div className="p-5 text-center text-secondary text-muted-foreground">No rows returned.</div>}</div>{inspectedCell && <aside className="flex w-64 shrink-0 flex-col border-l border-border bg-surface"><div className="flex h-8 items-center gap-2 border-b border-border px-2 text-caption"><span className="min-w-0 flex-1 truncate font-medium">{inspectedCell.column}</span><Button variant="ghost" size="icon-xs" aria-label="Close cell inspector" onClick={() => { setInspectedCell(null); onSelectCell(null); }}><span aria-hidden="true">×</span></Button></div><p className="px-2 pt-1 text-caption text-muted-foreground">Row {inspectedCell.row + 1} · {inspectedCell.value === null ? "NULL" : typeof inspectedCell.value}</p><pre data-selectable="true" className="m-2 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-code">{cellText(inspectedCell.value)}</pre><Button variant="outline" size="xs" className="mx-2 mb-2" onClick={() => void navigator.clipboard.writeText(cellText(inspectedCell.value)).catch(() => undefined)}><Copy data-icon="inline-start" />Copy value</Button></aside>}</div>;
}

function cellText(value: unknown): string { if (value === null || value === undefined) return "NULL"; if (typeof value === "string") return value; try { return JSON.stringify(value, null, 2); } catch { return String(value); } }
function gridRowHeight(): number { const height = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-h")); return Number.isFinite(height) && height > 0 ? height : 28; }

function StructureView({ query, onOpenTable }: { query: UseQueryResult<TableStructure>; onOpenTable: (schema: string, table: string) => void }) {
  if (query.isLoading) return <div className="space-y-2 p-3" role="status" aria-label="Loading table structure">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-7 w-full" key={index} />)}</div>;
  if (query.isError) return <ErrorPanel message={query.error.message} retry={() => void query.refetch()} />;
  const structure = query.data;
  if (!structure) return <EmptyState title="Select a table" description="Choose a table in the schema pane to inspect its structure." />;
  return <div className="min-h-0 flex-1 overflow-auto p-3"><header className="mb-3 flex items-center justify-between"><div><h2 className="text-body font-semibold">{structure.schema}.{structure.name}</h2><p className="text-caption text-muted-foreground">{structure.rowEstimate === null ? "Row estimate unavailable" : `~${structure.rowEstimate.toLocaleString()} rows`}</p></div><Button variant="outline" size="xs" onClick={() => onOpenTable(structure.schema, structure.name)}>Open data</Button></header><h3 className="mb-1 text-caption font-semibold">Columns</h3><div className="overflow-x-auto rounded border border-border"><table className="w-full text-left text-caption"><thead className="bg-muted"><tr>{["Name", "Type", "Nullable", "Default", "Key", "Comment"].map((label) => <th key={label} className="px-2 py-1.5 font-medium text-muted-foreground">{label}</th>)}</tr></thead><tbody>{structure.columns.map((column) => <tr key={column.name} className="border-t border-border"><td className="px-2 py-1.5 font-mono">{column.name}</td><td className="px-2 py-1.5 font-mono text-muted-foreground">{column.dataType}</td><td className="px-2 py-1.5">{column.nullable ? "Yes" : "No"}</td><td className="px-2 py-1.5 font-mono">{column.default ?? "—"}</td><td className="px-2 py-1.5">{column.isPrimaryKey ? "PK" : ""}</td><td className="max-w-64 truncate px-2 py-1.5 text-muted-foreground">{column.comment ?? ""}</td></tr>)}</tbody></table></div><h3 className="mb-1 mt-4 text-caption font-semibold">Indexes</h3><MetadataTable headings={["Name", "Columns", "Type"]} rows={structure.indexes.map((index) => [index.name, index.columns.join(", "), index.primary ? "Primary" : index.unique ? "Unique" : "Index"])} /><h3 className="mb-1 mt-4 text-caption font-semibold">Foreign keys</h3><MetadataTable headings={["Name", "Columns", "References"]} rows={structure.foreignKeys.map((key) => [key.name, key.columns.join(", "), `${key.refSchema ? `${key.refSchema}.` : ""}${key.refTable} (${key.refColumns.join(", ")})`])} /></div>;
}
function MetadataTable({ headings, rows }: { headings: string[]; rows: string[][] }) { return <div className="overflow-x-auto rounded border border-border"><table className="w-full text-left text-caption"><thead className="bg-muted"><tr>{headings.map((heading) => <th key={heading} className="px-2 py-1.5 font-medium text-muted-foreground">{heading}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t border-border">{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`} className="px-2 py-1.5 font-mono">{cell}</td>)}</tr>) : <tr><td className="px-2 py-2 text-muted-foreground" colSpan={headings.length}>None</td></tr>}</tbody></table></div>; }

function QueryWorkspace({ connection, schema, queryText, onQueryChange, limit, onLimitChange, onRun, result, error, history, historyOpen, onHistoryOpen, onUseHistory, editorRef, onCopy }: {
  connection: DatabaseConnection;
  schema?: Record<string, Record<string, string[]>>;
  queryText: string;
  onQueryChange: (value: string) => void;
  limit: number;
  onLimitChange: (value: number) => void;
  onRun: () => void;
  result: Awaited<ReturnType<typeof databaseApi.executeQuery>> | null;
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
  useEffect(() => { let mounted = true; void (mongodb ? loadJsonLanguage() : loadSqlLanguage(schema)).then((extension) => { if (mounted) setLanguage(extension); }); return () => { mounted = false; }; }, [mongodb, schema]);
  const resultRows = result ? { rows: result.rows, columns: result.columns.map((column) => ({ name: column.name, dataType: "" })), executionTimeMs: result.executionTimeMs, hasMore: result.truncated, offset: 0, limit } : undefined;
  const queryHistoryBox = historyOpen && <div className="absolute right-2 top-8 z-30 max-h-60 w-[min(420px,90vw)] overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg" role="listbox" aria-label="Query history">{history.length ? history.map((item, index) => <button key={`${index}-${item}`} role="option" className="block w-full truncate rounded px-2 py-1.5 text-left text-code hover:bg-muted" onClick={() => onUseHistory(item)}>{item}</button>) : <p className="px-2 py-3 text-caption text-muted-foreground">Run a query to build history.</p>}</div>;
  return <div className="flex min-h-0 flex-1 flex-col"><div className="relative flex h-8 shrink-0 items-center gap-2 border-b border-border px-2"><span className="inline-flex items-center gap-1 rounded border border-success/30 bg-success-subtle px-1.5 py-0.5 text-caption text-success" title="Write statements are rejected by the server"><ShieldCheck className="size-3" />Read-only</span><span className="text-caption text-muted-foreground">{mongodb ? "MongoDB JSON query · { collection, filter, projection, sort, limit }" : "SQL · writes are blocked"}</span><span className="flex-1" /><Button variant="ghost" size="xs" title="Write statements are rejected by the server" onClick={() => toast.info("The server rejects write statements; use a read-only database account too.")}>Why read-only?</Button><label className="flex items-center gap-1 text-caption text-muted-foreground">Limit<Input type="number" min={1} max={1000} value={limit} onChange={(event) => onLimitChange(Number(event.target.value))} className="h-6 w-16 px-1 text-caption" /></label><div className="relative"><Button variant="outline" size="xs" aria-expanded={historyOpen} onClick={() => onHistoryOpen(!historyOpen)}>History<ChevronDown data-icon="inline-end" /></Button>{queryHistoryBox}</div><Button size="xs" onClick={onRun}><Code2 data-icon="inline-start" />Run <kbd className="ml-1 rounded bg-primary-foreground/15 px-1 text-caption">⌘↵</kbd></Button></div>
    {mongodb && <div className="border-b border-border bg-info-subtle px-3 py-1.5 text-caption text-info">Use a read-only JSON query: <code className="font-mono">{"{\"collection\":\"orders\",\"filter\":{},\"limit\":20}"}</code></div>}
    <div className="min-h-32 shrink-0 border-b border-border" aria-label="Read-only query editor"><Suspense fallback={<div className="p-3" role="status" aria-label="Loading query editor"><Skeleton className="h-32 w-full" /></div>}><SqlEditor value={queryText} height="160px" extensions={[...(language ? [language] : []), EditorView.theme({ ".cm-content, .cm-gutter": { fontFamily: "var(--font-mono)", fontSize: "var(--font-size-code)", fontFeatureSettings: "var(--font-feature-settings)" } })]} onChange={onQueryChange} onCreateEditor={(view) => { editorRef.current = { view }; }} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }} theme={document.documentElement.classList.contains("dark") ? "dark" : "light"} className="font-mono" /></Suspense></div>
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{error && <div className="relative z-30 shrink-0 border-b border-danger/30 bg-danger-subtle px-3 py-2 text-caption text-danger" role="alert"><strong>{error}</strong>{result?.hint && <p className="mt-0.5">{result.hint}</p>}</div>}{result?.success && result.truncated && <div className="relative z-30 shrink-0 border-b border-warning/30 bg-warning-subtle px-3 py-1.5 text-caption text-warning" role="status">Results truncated at {limit} rows. {result.hint}</div>}{result ? <><VirtualDataGrid rows={resultRows?.rows ?? []} columns={resultRows?.columns ?? []} onSort={() => undefined} direction="asc" onCopy={onCopy} /><div className="relative z-30 flex h-7 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-caption text-muted-foreground"><span>{result.rowCount} rows</span><span>{result.executionTimeMs} ms</span>{result.truncated && <span className="text-warning">Truncated</span>}</div></> : !error && <div className="flex min-h-0 flex-1 items-center justify-center text-caption text-muted-foreground">Run a read-only query to see results here.</div>}</div>
  </div>;
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) { return <div className="m-3 rounded-md border border-danger/30 bg-danger-subtle p-3 text-secondary text-danger" role="alert"><p>{message}</p><Button variant="outline" size="xs" className="mt-2" onClick={retry}>Retry</Button></div>; }
