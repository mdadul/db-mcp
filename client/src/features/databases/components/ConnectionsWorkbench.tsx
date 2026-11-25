import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Plug, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { DbEngineIcon } from "@/components/brand/DbEngineIcon";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DocumentTabs, type DocumentTab } from "@/components/ui/DocumentTabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/EmptyState";
import { ResizablePanels } from "@/components/ui/ResizablePanels";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { useServerInfo } from "@/platform/hooks";

import { databaseApi } from "../api/databaseApi";
import type { DatabaseConnection } from "../types";
import { ConnectionTree } from "../workbench/ConnectionTree";
import { EnvironmentTag } from "../workbench/EnvironmentTag";
import { ConnectionContextMenu, ExplorerPane } from "../workbench/ExplorerPane";
import {
  READ_ONLY_TOOLTIP,
  browseQuery,
  collectRecentQueries,
  collectRecentTables,
  acknowledgeProduction,
  connectionListExport,
  connectionStatus,
  environmentTone,
  formatRelative,
  hasAcknowledgedProduction,
  isProductionEnvironment,
  readStoredHistory,
  recentTablesFor,
  type TableRef,
  type TestState,
} from "../workbench/model";
import { QueryWorkspace } from "../workbench/QueryWorkspace";
import { StructureView } from "../workbench/StructureView";
import { useQueryEditor } from "../workbench/useQueryEditor";
import { useSavedQueries } from "../workbench/useSavedQueries";
import { useTableBrowser } from "../workbench/useTableBrowser";
import { useWorkbenchTabs } from "../workbench/useWorkbenchTabs";
import { ConnectionsHome, type RecentQueryItem, type RecentTableItem } from "./ConnectionsHome";
import { downloadText } from "./gridData";
import { VirtualDataTable } from "./VirtualDataGrid";

/** Connections home and read-only schema/query workbench. Layout and orchestration only; state lives in ../workbench. */
export function ConnectionsWorkbench() {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: serverInfo } = useServerInfo();
  const [selectedId, setSelectedId] = useState(routeId ?? "");
  const [deleteTarget, setDeleteTarget] = useState<DatabaseConnection | null>(null);
  const [pendingEnable, setPendingEnable] = useState<DatabaseConnection | null>(null);
  const [sessionTests, setSessionTests] = useState<Record<string, TestState>>({});
  const [connectionMenu, setConnectionMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const searchRef = useRef<HTMLInputElement>(null);

  const connectionsQuery = useQuery({ queryKey: ["databases"], queryFn: databaseApi.list });
  const connections = connectionsQuery.data ?? [];
  // Persisted results from the last test seed the map; a test run in this session overrides them.
  const testStates = useMemo(() => {
    const persisted: Record<string, TestState> = {};
    for (const item of connections)
      if (item.lastTestStatus) persisted[item.id] = item.lastTestStatus;
    return { ...persisted, ...sessionTests };
  }, [connections, sessionTests]);
  const connection = connections.find((item) => item.id === selectedId);
  const selectedConnectionStatus = connection
    ? connectionStatus(connection, testStates[connection.id])
    : null;

  const workbench = useWorkbenchTabs(selectedId, connection);
  const { tabs, activeId, activeTab, selectedTable, setSelectedTable, tabsByConnection } =
    workbench;
  const editor = useQueryEditor({
    selectedId,
    connection,
    activeTab,
    activeId,
    updateTabQuery: workbench.updateTabQuery,
  });
  const browser = useTableBrowser(selectedId, selectedTable, activeTab?.kind);
  const saved = useSavedQueries(selectedId);
  // Unfiltered schema for SQL autocomplete. The explorer's per-connection trees share this cache entry.
  const schemaQuery = useQuery({
    queryKey: ["database-schema", selectedId, ""],
    queryFn: () => databaseApi.getSchemaTree(selectedId),
    enabled: Boolean(selectedId && connection?.status === "enabled"),
    retry: 1,
    staleTime: 30_000,
  });

  const favouriteMutation = useMutation({
    mutationFn: (item: DatabaseConnection) =>
      databaseApi.update(item.id, { favourite: !item.favourite }),
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: ["databases"] });
      toast.success(
        item.favourite
          ? `${item.name} added to favourites`
          : `${item.name} removed from favourites`,
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update favourite"),
  });
  const toggleStatus = useMutation({
    mutationFn: (item: DatabaseConnection) =>
      databaseApi.toggleStatus(item.id, item.status === "enabled" ? "disabled" : "enabled"),
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: ["databases"] });
      toast.success(`${item.name} ${item.status}`);
    },
  });
  /** Enabling a production connection asks once per connection before AI clients can query it. */
  const requestToggle = (item: DatabaseConnection) => {
    if (
      item.status === "disabled" &&
      isProductionEnvironment(item.environment) &&
      !hasAcknowledgedProduction(item.id)
    )
      setPendingEnable(item);
    else toggleStatus.mutate(item);
  };
  const deleteConnection = useMutation({
    mutationFn: (item: DatabaseConnection) => databaseApi.delete(item.id),
    onSuccess: async () => {
      const deletedId = deleteTarget?.id;
      await queryClient.invalidateQueries({ queryKey: ["databases"] });
      if (deletedId === selectedId) {
        setSelectedId("");
        navigate("/connections", { replace: true });
      }
      setDeleteTarget(null);
      toast.success("Connection deleted");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not delete connection"),
  });

  useEffect(() => {
    if (routeId && routeId !== selectedId) setSelectedId(routeId);
  }, [routeId, selectedId]);
  useEffect(() => {
    if (selectedId && !routeId) navigate(`/connections/${selectedId}`, { replace: true });
  }, [selectedId, routeId, navigate]);
  useEffect(() => {
    if (!connectionMenu) return;
    const close = () => setConnectionMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [connectionMenu]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLocaleLowerCase()}`);
    }
  };
  const { openTab } = workbench;
  const openQueryTab = useCallback(() => {
    if (selectedId) openTab(selectedId, "query");
  }, [openTab, selectedId]);
  const openTable = (schema: string, name: string, kind: "data" | "structure") => {
    browser.resetPage();
    workbench.openTab(selectedId, kind, { schema, name });
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (mod && event.key.toLowerCase() === "t") {
        event.preventDefault();
        openQueryTab();
      }
      if (mod && event.key.toLowerCase() === "w" && activeId && selectedId) {
        event.preventDefault();
        workbench.closeTab(selectedId, activeId);
      }
      if (mod && event.key === "Enter" && activeTab?.kind === "query") {
        event.preventDefault();
        void editor.runQuery(event.shiftKey ? "all" : "current");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const recentTables = useMemo(
    () => collectRecentTables(tabsByConnection, connections),
    [tabsByConnection, connections],
  );
  const recentQueries = useMemo(
    () => collectRecentQueries(readStoredHistory(), connections),
    [connections, editor.history],
  );
  const connectionsForMenu = connectionMenu
    ? connections.find((item) => item.id === connectionMenu.id)
    : undefined;

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
      setSessionTests((current) => ({
        ...current,
        [item.id]: result.success ? "reachable" : "unreachable",
      }));
      toast[result.success ? "success" : "error"](result.message, { description: result.hint });
    } catch (error) {
      setSessionTests((current) => ({ ...current, [item.id]: "unreachable" }));
      toast.error(error instanceof Error ? error.message : "Connection test failed");
    }
  };
  const copyConnectionUrl = async (item: DatabaseConnection) => {
    try {
      const result = await databaseApi.getConnectionString(item.id);
      await copy(result.url, "Masked connection URL");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load connection URL");
    }
  };

  const structureQuery = browser.structureQuery;
  const languageSchema = schemaQuery.data
    ? Object.fromEntries(
        schemaQuery.data.schemas.map((schema) => [
          schema.name,
          Object.fromEntries(
            schema.tables.map((table) => [
              table.name,
              table.name === selectedTable?.name
                ? (structureQuery.data?.columns.map((column) => column.name) ?? [])
                : [],
            ]),
          ),
        ]),
      )
    : undefined;

  // Table actions from the explorer may target a connection that is not selected yet, so they select it first.
  const focusConnection = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    navigate(`/connections/${id}`, { replace: true });
  };
  const openTableFrom = (
    item: DatabaseConnection,
    schema: string,
    name: string,
    kind: "data" | "structure",
  ) => {
    browser.resetPage();
    workbench.openTab(item.id, kind, { schema, name });
    focusConnection(item.id);
  };
  const queryTableFrom = (item: DatabaseConnection, schema: string, name: string) => {
    workbench.openTab(item.id, "query", undefined, browseQuery(item, { schema, name }));
    focusConnection(item.id);
  };
  const renderTree = (item: DatabaseConnection) => (
    <ConnectionTree
      connection={item}
      selectedTable={item.id === selectedId ? selectedTable : null}
      recentTables={recentTablesFor(tabsByConnection[item.id] ?? [])}
      onOpenData={(schema, name) => openTableFrom(item, schema, name, "data")}
      onOpenStructure={(schema, name) => openTableFrom(item, schema, name, "structure")}
      onQuery={(schema, name) => queryTableFrom(item, schema, name)}
      onCopy={(value) => void copy(value, "Name")}
      onEnable={() => requestToggle(item)}
    />
  );

  const connectionsPane = (
    <ExplorerPane
      query={connectionsQuery}
      selectedId={selectedId}
      testStates={testStates}
      searchRef={searchRef}
      renderTree={renderTree}
      onExport={() =>
        downloadText(
          "db-mcp-connections.json",
          connectionListExport(connections),
          "application/json",
        )
      }
      onSelect={handleSelectConnection}
      onOpenMenu={(item, x, y) => setConnectionMenu({ id: item.id, x, y })}
      onAdd={() => navigate("/connections/new")}
    />
  );

  const mainPane = (
    <section
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      aria-label="Database workbench"
    >
      {connection && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
          <DbEngineIcon type={connection.type} className="size-4" />
          <span className="max-w-52 truncate text-ui-sm font-semibold">{connection.name}</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-ui-xs uppercase text-muted-foreground">
            {connection.type}
          </span>
          <EnvironmentTag environment={connection.environment} />
          <span className="hidden truncate text-ui-xs text-muted-foreground @xl:inline">
            {connection.lastUsedByAiAt
              ? `AI last used ${formatRelative(connection.lastUsedByAiAt)}`
              : "No AI use yet"}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => navigate(`/activity?databaseId=${connection.id}&source=mcp`)}
          >
            AI activity
          </Button>
          {connection.lastTestedAt && (
            <span
              className="hidden min-w-0 truncate text-ui-xs text-muted-foreground @xl:inline"
              title={connection.lastTestMessage ?? undefined}
            >
              {connection.lastTestStatus === "reachable"
                ? `Tested ${formatRelative(connection.lastTestedAt)}${connection.lastTestLatencyMs !== null ? ` · ${connection.lastTestLatencyMs} ms` : ""}${connection.serverVersion ? ` · ${connection.serverVersion}` : ""}`
                : `Test failed ${formatRelative(connection.lastTestedAt)}`}
            </span>
          )}
          {selectedConnectionStatus && (
            <Tooltip content={selectedConnectionStatus.label}>
              <span
                className="inline-flex"
                tabIndex={0}
                aria-label={selectedConnectionStatus.label}
              >
                <StatusDot state={selectedConnectionStatus.state} />
              </span>
            </Tooltip>
          )}
          <span className="flex-1" />
          <Tooltip content={READ_ONLY_TOOLTIP}>
            <span
              className="inline-flex cursor-default items-center gap-1 rounded border border-success/30 bg-success-subtle px-1.5 py-0.5 text-ui-xs text-success"
              tabIndex={0}
            >
              <ShieldCheck className="size-3" />
              Read-only
            </span>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-xs" aria-label="Connection actions">
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void runConnectionTest(connection)}>
                <Plug className="size-3.5" />
                Test connection
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/connections/${connection.id}/edit`)}>
                <Pencil className="size-3.5" />
                Edit connection
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void queryClient.invalidateQueries({
                    queryKey: ["database-schema", connection.id],
                  })
                }
              >
                <RefreshCw className="size-3.5" />
                Refresh schema
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {connection?.status === "disabled" && (
        <div
          className="flex shrink-0 items-center justify-between border-b border-warning/30 bg-warning-subtle px-3 py-2 text-ui-sm"
          role="status"
        >
          <span>This connection is disabled. Enable it to browse or query this database.</span>
          <Button variant="outline" size="xs" onClick={() => requestToggle(connection)}>
            Enable
          </Button>
        </div>
      )}
      {!connection ? (
        connectionsQuery.isLoading && selectedId ? (
          <div role="status" aria-label="Loading connection" className="space-y-3 p-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <ConnectionsHome
            connections={connections}
            testStates={testStates}
            recentTables={recentTables}
            recentQueries={recentQueries}
            mcpUrl={serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp"}
            onNewConnection={() => navigate("/connections/new")}
            onOpenTable={openRecentTable}
            onOpenQuery={openRecentQuery}
            onOpenAiClients={() => navigate("/ai-clients")}
          />
        )
      ) : (
        <>
          <div
            className={`relative z-30 flex min-h-(--control-h-lg) min-w-0 shrink-0 items-end overflow-hidden border-b border-border ${connection.environment ? (environmentTone(connection.environment)?.strip ?? "") : ""}`}
          >
            <DocumentTabs
              tabs={tabs as DocumentTab[]}
              activeId={activeId}
              onSelect={(tabId) => workbench.selectTab(connection.id, tabId)}
              onClose={(tabId) => workbench.closeTab(connection.id, tabId)}
              className="min-w-0 flex-1 px-2"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="New query tab"
              title="New query (⌘T)"
              className="mb-1 mr-1"
              onClick={() => openQueryTab()}
            >
              <Plus />
            </Button>
          </div>
          {!activeTab ? (
            <EmptyState
              title="Open a table or query"
              description="Choose an object in the schema pane or create a query tab."
              action={
                <Button size="sm" onClick={() => openQueryTab()}>
                  New query
                </Button>
              }
            />
          ) : activeTab.kind === "query" ? (
            <QueryWorkspace
              connection={connection}
              schema={languageSchema}
              editor={editor}
              saved={saved}
              onCopy={(text) => void copy(text, "Query results")}
            />
          ) : activeTab.kind === "structure" ? (
            <StructureView
              query={structureQuery}
              onOpenTable={(schema, name) => openTable(schema, name, "data")}
            />
          ) : (
            <VirtualDataTable
              data={browser.rowsQuery.data}
              isLoading={browser.rowsQuery.isLoading}
              error={browser.rowsQuery.isError ? browser.rowsQuery.error.message : undefined}
              onRetry={() => void browser.rowsQuery.refetch()}
              pageSize={browser.pageSize}
              onPageSize={browser.changePageSize}
              onOffset={browser.setOffset}
              onSort={browser.sort}
              orderBy={browser.orderBy}
              direction={browser.direction}
              onCopy={(text) => void copy(text, "Cell")}
            />
          )}
        </>
      )}
    </section>
  );

  const connectionMenuActions =
    connectionsForMenu && connectionMenu ? (
      <ConnectionContextMenu
        item={connectionsForMenu}
        point={connectionMenu}
        onOpen={() => handleSelectConnection(connectionsForMenu)}
        onEdit={() => navigate(`/connections/${connectionsForMenu.id}/edit`)}
        onTest={() => void runConnectionTest(connectionsForMenu)}
        onDuplicate={async () => {
          try {
            const duplicate = await databaseApi.duplicate(connectionsForMenu.id);
            await queryClient.invalidateQueries({ queryKey: ["databases"] });
            toast.success(`Duplicated as ${duplicate.name}`);
            navigate(`/connections/${duplicate.id}/edit?duplicate=1`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not duplicate connection");
          }
        }}
        onCopyUrl={() => void copyConnectionUrl(connectionsForMenu)}
        onCopyMcp={() =>
          void copy(
            JSON.stringify(
              {
                mcpServers: {
                  "db-mcp": { url: serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp" },
                },
              },
              null,
              2,
            ),
            `${connectionsForMenu.name} MCP config`,
          )
        }
        onToggle={() => requestToggle(connectionsForMenu)}
        onFavourite={() => favouriteMutation.mutate(connectionsForMenu)}
        onDelete={() => setDeleteTarget(connectionsForMenu)}
      />
    ) : null;

  return (
    <div
      className="relative h-full min-h-0 min-w-0 overflow-hidden"
      onClick={() => connectionMenu && setConnectionMenu(null)}
    >
      <ResizablePanels
        id="connections-workbench"
        className="h-full"
        panels={[
          {
            id: "connections",
            defaultSize: 24,
            minSize: 16,
            maxSize: 40,
            content: connectionsPane,
          },
          { id: "main", defaultSize: 76, minSize: 40, content: mainPane },
        ]}
      />
      {connectionMenuActions}
      <ConfirmDialog
        open={Boolean(pendingEnable)}
        onOpenChange={(open) => {
          if (!open) setPendingEnable(null);
        }}
        title="Allow AI access to a production connection?"
        description={`AI clients will be able to run read-only queries against “${pendingEnable?.name ?? "this connection"}”. Use a read-only database account. You will only be asked once for this connection.`}
        confirmLabel="Enable AI access"
        pending={toggleStatus.isPending}
        onConfirm={() => {
          if (pendingEnable) {
            acknowledgeProduction(pendingEnable.id);
            toggleStatus.mutate(pendingEnable);
            setPendingEnable(null);
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete connection?"
        description={`This removes “${deleteTarget?.name ?? "connection"}” from this computer and disconnects AI clients from it.`}
        confirmLabel="Delete connection"
        pending={deleteConnection.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteConnection.mutate(deleteTarget);
        }}
      />
    </div>
  );
}
