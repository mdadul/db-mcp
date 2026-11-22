import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { FolderTree, MoreHorizontal, Pencil, Plug, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { ResizablePanels } from "@/components/ui/ResizablePanels";
import { DocumentTabs, type DocumentTab } from "@/components/ui/DocumentTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusDot } from "@/components/ui/StatusDot";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DbEngineIcon } from "@/components/brand/DbEngineIcon";
import { useServerInfo } from "@/platform/hooks";
import { databaseApi } from "../api/databaseApi";
import type { DatabaseConnection, SchemaTree } from "../types";
import { ConnectionsHome, type RecentQueryItem, type RecentTableItem } from "./ConnectionsHome";
import { VirtualDataTable } from "./VirtualDataGrid";
import { ConnectionContextMenu, ExplorerPane } from "../workbench/ExplorerPane";
import { SchemaPane } from "../workbench/SchemaPane";
import { QueryWorkspace } from "../workbench/QueryWorkspace";
import { StructureView } from "../workbench/StructureView";
import { useQueryEditor } from "../workbench/useQueryEditor";
import { useFavouriteTables } from "../workbench/useFavouriteTables";
import { useSavedQueries } from "../workbench/useSavedQueries";
import { useTableBrowser } from "../workbench/useTableBrowser";
import { useWorkbenchTabs } from "../workbench/useWorkbenchTabs";
import { READ_ONLY_TOOLTIP, browseQuery, collectRecentQueries, collectRecentTables, connectionStatus, readStoredHistory, recentTablesFor, type TableRef, type TestState } from "../workbench/model";

/** Connections home and read-only schema/query workbench. Layout and orchestration only; state lives in ../workbench. */
export function ConnectionsWorkbench() {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: serverInfo } = useServerInfo();
  const [selectedId, setSelectedId] = useState(routeId ?? "");
  const [schemaFilter, setSchemaFilter] = useState("");
  const [debouncedSchemaFilter, setDebouncedSchemaFilter] = useState("");
  const [collapsedSchema, setCollapsedSchema] = useState(false);
  const [narrowViewport, setNarrowViewport] = useState(() => window.innerWidth < 1100);
  const [deleteTarget, setDeleteTarget] = useState<DatabaseConnection | null>(null);
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});
  const [connectionMenu, setConnectionMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const connectionsQuery = useQuery({ queryKey: ["databases"], queryFn: databaseApi.list });
  const connections = connectionsQuery.data ?? [];
  const connection = connections.find((item) => item.id === selectedId);
  const selectedConnectionStatus = connection ? connectionStatus(connection, testStates[connection.id]) : null;

  const workbench = useWorkbenchTabs(selectedId, connection);
  const { tabs, activeId, activeTab, selectedTable, setSelectedTable, tabsByConnection } = workbench;
  const editor = useQueryEditor({ selectedId, connection, activeTab, activeId, updateTabQuery: workbench.updateTabQuery });
  const browser = useTableBrowser(selectedId, selectedTable, activeTab?.kind);
  const favourites = useFavouriteTables(selectedId);
  const saved = useSavedQueries(selectedId);
  const recentForConnection = useMemo(() => recentTablesFor(selectedId ? tabsByConnection[selectedId] ?? [] : []), [selectedId, tabsByConnection]);

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSchemaFilter(schemaFilter), 150); return () => window.clearTimeout(timer); }, [schemaFilter]);
  const schemaQuery = useQuery({ queryKey: ["database-schema", selectedId, debouncedSchemaFilter], queryFn: () => databaseApi.getSchemaTree(selectedId, debouncedSchemaFilter || undefined), enabled: Boolean(selectedId && connection?.status === "enabled"), retry: 1, staleTime: 30_000 });

  const toggleStatus = useMutation({ mutationFn: (item: DatabaseConnection) => databaseApi.toggleStatus(item.id, item.status === "enabled" ? "disabled" : "enabled"), onSuccess: async (item) => { await queryClient.invalidateQueries({ queryKey: ["databases"] }); toast.success(`${item.name} ${item.status}`); } });
  const deleteConnection = useMutation({ mutationFn: (item: DatabaseConnection) => databaseApi.delete(item.id), onSuccess: async () => { const deletedId = deleteTarget?.id; await queryClient.invalidateQueries({ queryKey: ["databases"] }); if (deletedId === selectedId) { setSelectedId(""); navigate("/connections", { replace: true }); } setDeleteTarget(null); toast.success("Connection deleted"); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete connection") });

  useEffect(() => { if (routeId && routeId !== selectedId) setSelectedId(routeId); }, [routeId, selectedId]);
  useEffect(() => { if (selectedId && !routeId) navigate(`/connections/${selectedId}`, { replace: true }); }, [selectedId, routeId, navigate]);
  useEffect(() => { const resize = () => setNarrowViewport(window.innerWidth < 1100); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  useEffect(() => { if (narrowViewport) setCollapsedSchema(true); }, [narrowViewport]);
  useEffect(() => {
    if (!connectionMenu) return;
    const close = () => setConnectionMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", close); };
  }, [connectionMenu]);

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error(`Could not copy ${label.toLocaleLowerCase()}`); }
  };
  const { openTab } = workbench;
  const openQueryTab = useCallback((query?: string) => { if (selectedId) openTab(selectedId, "query", undefined, query); }, [openTab, selectedId]);
  const openTable = (schema: string, name: string, kind: "data" | "structure") => { browser.resetPage(); workbench.openTab(selectedId, kind, { schema, name }); };
  const openTableQuery = (schema: string, name: string) => openQueryTab(browseQuery(connection, { schema, name }));

  // Analyst "open in SQL editor" hands the query over through sessionStorage.
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "f") { event.preventDefault(); searchRef.current?.focus(); }
      if (mod && event.key.toLowerCase() === "t") { event.preventDefault(); openQueryTab(); }
      if (mod && event.key.toLowerCase() === "w" && activeId && selectedId) { event.preventDefault(); workbench.closeTab(selectedId, activeId); }
      if (mod && event.key === "Enter" && activeTab?.kind === "query") { event.preventDefault(); void editor.runQuery(event.shiftKey ? "all" : "current"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const recentTables = useMemo(() => collectRecentTables(tabsByConnection, connections), [tabsByConnection, connections]);
  const recentQueries = useMemo(() => collectRecentQueries(readStoredHistory(), connections), [connections, editor.history]);
  const connectionsForMenu = connectionMenu ? connections.find((item) => item.id === connectionMenu.id) : undefined;

  const handleSelectConnection = (item: DatabaseConnection) => {
    setSelectedId(item.id);
    setSelectedTable(null);
    browser.resetPage();
    navigate(`/connections/${item.id}`, { replace: true });
  };
  const openRecentTable = (item: RecentTableItem) => {
    const table: TableRef = { schema: item.schema, name: item.table };
    workbench.openTab(item.connectionId, "data", table);
    setSelectedId(item.connectionId);
    browser.resetPage();
    navigate(`/connections/${item.connectionId}`, { replace: true });
  };
  const openRecentQuery = (item: RecentQueryItem) => {
    workbench.openTab(item.connectionId, "query", undefined, item.query);
    setSelectedId(item.connectionId);
    setSelectedTable(null);
    navigate(`/connections/${item.connectionId}`, { replace: true });
  };
  const runConnectionTest = async (item: DatabaseConnection) => {
    try {
      const result = await databaseApi.testConnection(item.id);
      setTestStates((current) => ({ ...current, [item.id]: result.success ? "reachable" : "unreachable" }));
      toast[result.success ? "success" : "error"](result.message, { description: result.hint });
    } catch (error) {
      setTestStates((current) => ({ ...current, [item.id]: "unreachable" }));
      toast.error(error instanceof Error ? error.message : "Connection test failed");
    }
  };
  const copyConnectionUrl = async (item: DatabaseConnection) => {
    try { const result = await databaseApi.getConnectionString(item.id); await copy(result.url, "Masked connection URL"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load connection URL"); }
  };

  const structureQuery = browser.structureQuery;
  const languageSchema = schemaQuery.data ? Object.fromEntries(schemaQuery.data.schemas.map((schema) => [schema.name, Object.fromEntries(schema.tables.map((table) => [table.name, table.name === selectedTable?.name ? structureQuery.data?.columns.map((column) => column.name) ?? [] : []]))])) : undefined;

  const connectionsPane = <ExplorerPane query={connectionsQuery} selectedId={selectedId} testStates={testStates} searchRef={searchRef} onSelect={handleSelectConnection} onOpenMenu={(item, x, y) => setConnectionMenu({ id: item.id, x, y })} onAdd={() => navigate("/connections/new")} />;

  const schemaPane = <SchemaPane connection={connection} connections={connections} onSwitchConnection={handleSelectConnection} query={schemaQuery} filter={schemaFilter} onFilter={setSchemaFilter} selectedTable={selectedTable} recentTables={recentForConnection} favouriteKeys={favourites.favouriteKeys} onToggleFavourite={favourites.toggle} collapsed={collapsedSchema} onCollapse={() => setCollapsedSchema(true)} onRefresh={() => void schemaQuery.refetch()} onOpenData={(schema, name) => openTable(schema, name, "data")} onOpenStructure={(schema, name) => openTable(schema, name, "structure")} onQuery={openTableQuery} onCopy={(value) => void copy(value, "Name")} onEnable={(item) => toggleStatus.mutate(item)} />;

  const mainPane = <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background" aria-label="Database workbench">
    {connection && <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
      <DbEngineIcon type={connection.type} className="size-4" />
      <span className="max-w-52 truncate text-ui-sm font-semibold">{connection.name}</span>
      <span className="rounded border border-border px-1.5 py-0.5 text-ui-xs uppercase text-muted-foreground">{connection.type}</span>
      {selectedConnectionStatus && <Tooltip content={selectedConnectionStatus.label}><span className="inline-flex" tabIndex={0} aria-label={selectedConnectionStatus.label}><StatusDot state={selectedConnectionStatus.state} /></span></Tooltip>}
      <span className="flex-1" />
      <Tooltip content={READ_ONLY_TOOLTIP}><span className="inline-flex cursor-default items-center gap-1 rounded border border-success/30 bg-success-subtle px-1.5 py-0.5 text-ui-xs text-success" tabIndex={0}><ShieldCheck className="size-3" />Read-only</span></Tooltip>
      {collapsedSchema && <Button variant="outline" size="xs" onClick={() => setCollapsedSchema(false)}><FolderTree data-icon="inline-start" />Schema</Button>}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Connection actions"><MoreHorizontal /></Button>} />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void runConnectionTest(connection)}><Plug className="size-3.5" />Test connection</DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/connections/${connection.id}/edit`)}><Pencil className="size-3.5" />Edit connection</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void schemaQuery.refetch()}><RefreshCw className="size-3.5" />Refresh schema</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>}
    {connection?.status === "disabled" && <div className="flex shrink-0 items-center justify-between border-b border-warning/30 bg-warning-subtle px-3 py-2 text-ui-sm" role="status"><span>This connection is disabled. Enable it to browse or query this database.</span><Button variant="outline" size="xs" onClick={() => toggleStatus.mutate(connection)}>Enable</Button></div>}
    {!connection ? connectionsQuery.isLoading && selectedId ? <div role="status" aria-label="Loading connection" className="space-y-3 p-4"><Skeleton className="h-4 w-48" /><Skeleton className="h-8 w-full" /><Skeleton className="h-32 w-full" /></div>
      : <ConnectionsHome connections={connections} testStates={testStates} recentTables={recentTables} recentQueries={recentQueries} mcpUrl={serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp"} onNewConnection={() => navigate("/connections/new")} onOpenTable={openRecentTable} onOpenQuery={openRecentQuery} onOpenAiClients={() => navigate("/ai-clients")} />
      : <>
        <div className="relative z-30 flex min-h-(--control-h-lg) min-w-0 shrink-0 items-end overflow-hidden border-b border-border"><DocumentTabs tabs={tabs as DocumentTab[]} activeId={activeId} onSelect={(tabId) => workbench.selectTab(connection.id, tabId)} onClose={(tabId) => workbench.closeTab(connection.id, tabId)} className="min-w-0 flex-1 px-2" /><Button variant="ghost" size="icon-xs" aria-label="New query tab" title="New query (⌘T)" className="mb-1 mr-1" onClick={() => openQueryTab()}><Plus /></Button></div>
        {!activeTab ? <EmptyState title="Open a table or query" description="Choose an object in the schema pane or create a query tab." action={<Button size="sm" onClick={() => openQueryTab()}>New query</Button>} />
          : activeTab.kind === "query" ? <QueryWorkspace connection={connection} schema={languageSchema} editor={editor} saved={saved} onCopy={(text) => void copy(text, "Query results")} />
            : activeTab.kind === "structure" ? <StructureView query={structureQuery} onOpenTable={(schema, name) => openTable(schema, name, "data")} />
              : <VirtualDataTable data={browser.rowsQuery.data} isLoading={browser.rowsQuery.isLoading} error={browser.rowsQuery.isError ? browser.rowsQuery.error.message : undefined} onRetry={() => void browser.rowsQuery.refetch()} pageSize={browser.pageSize} onPageSize={browser.changePageSize} onOffset={browser.setOffset} onSort={browser.sort} orderBy={browser.orderBy} direction={browser.direction} onCopy={(text) => void copy(text, "Cell")} />}
      </>}
  </section>;

  const connectionMenuActions = connectionsForMenu && connectionMenu ? <ConnectionContextMenu item={connectionsForMenu} point={connectionMenu}
    onOpen={() => handleSelectConnection(connectionsForMenu)}
    onEdit={() => navigate(`/connections/${connectionsForMenu.id}/edit`)}
    onTest={() => void runConnectionTest(connectionsForMenu)}
    onDuplicate={async () => { try { const duplicate = await databaseApi.duplicate(connectionsForMenu.id); await queryClient.invalidateQueries({ queryKey: ["databases"] }); toast.success(`Duplicated as ${duplicate.name}`); navigate(`/connections/${duplicate.id}/edit?duplicate=1`); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not duplicate connection"); } }}
    onCopyUrl={() => void copyConnectionUrl(connectionsForMenu)}
    onCopyMcp={() => void copy(JSON.stringify({ mcpServers: { "db-mcp": { url: serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp" } } }, null, 2), `${connectionsForMenu.name} MCP config`)}
    onToggle={() => toggleStatus.mutate(connectionsForMenu)}
    onDelete={() => setDeleteTarget(connectionsForMenu)} /> : null;

  return <div className="relative h-full min-h-0 min-w-0 overflow-hidden" onClick={() => connectionMenu && setConnectionMenu(null)}>
    {narrowViewport
      ? <div className="flex h-full min-h-0 min-w-0"><div className="w-56 min-w-44 shrink-0">{connectionsPane}</div><div className="min-h-0 min-w-0 flex-1">{mainPane}</div>{!collapsedSchema && connection && <div className="absolute inset-y-0 left-56 z-30 w-[min(320px,75vw)] border-r border-border bg-surface shadow-xl">{schemaPane}</div>}</div>
      : connection
        ? <ResizablePanels key="workbench" id="connections-workbench" className="h-full" panels={[
          { id: "connections", defaultSize: 20, minSize: 14, maxSize: 28, content: connectionsPane },
          { id: "schema", defaultSize: 24, minSize: 14, maxSize: 35, content: schemaPane },
          { id: "main", defaultSize: 56, minSize: 35, content: mainPane },
        ]} />
        : <ResizablePanels key="home" id="connections-workbench-home" className="h-full" panels={[
          { id: "connections", defaultSize: 24, minSize: 16, maxSize: 34, content: connectionsPane },
          { id: "main", defaultSize: 76, minSize: 40, content: mainPane },
        ]} />}
    {connectionMenuActions}
    <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} title="Delete connection?" description={`This removes “${deleteTarget?.name ?? "connection"}” from this computer and disconnects AI clients from it.`} confirmLabel="Delete connection" pending={deleteConnection.isPending} onConfirm={() => { if (deleteTarget) deleteConnection.mutate(deleteTarget); }} />
  </div>;
}
