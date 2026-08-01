import React, { useState, useEffect } from "react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Database,
  Copy,
  Check,
  X,
  Zap,
  Table,
  Play,
  History,
  Code,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Filter,
  Columns,
  TableProperties,
  Layers,
} from "@/components/ui/Icons";
import { databaseApi } from "../api/databaseApi";
import type {
  DatabaseConnection,
  StructuredQueryResult,
  QueryLogItem,
  TableMeta,
  TableSchema,
} from "../types";

export interface DatabaseDetailModalProps {
  database: DatabaseConnection | null;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "overview" | "schema" | "playground" | "logs" | "agent";
}

type TabType = "overview" | "schema" | "playground" | "logs" | "agent";

export function DatabaseDetailModal({
  database,
  isOpen,
  onClose,
  initialTab = "overview",
}: DatabaseDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const { copied: copiedSnippet, copy: _copy } = useCopyToClipboard();
  const copyToClipboard = async (text: string, label: string) => {
    await _copy(text, label);
    toast.add({ type: "info", title: `Copied ${label} snippet` });
  };

  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionLatency, setConnectionLatency] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [loadingSchema, setLoadingSchema] = useState(false);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [schemaSearch, setSchemaSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [loadingTableSchema, setLoadingTableSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [tableSchemaError, setTableSchemaError] = useState<string | null>(null);
  const [tableDetails, setTableDetails] = useState<TableSchema | null>(null);

  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM information_schema.tables LIMIT 10;");
  const [runningQuery, setRunningQuery] = useState(false);
  const [queryResult, setQueryResult] = useState<StructuredQueryResult | null>(null);

  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logs, setLogs] = useState<QueryLogItem[]>([]);

  const [selectedClient, setSelectedClient] = useState<"claude_desktop" | "cursor" | "claude_code" | "windsurf">("claude_desktop");

  const queryPresets = [
    "SELECT * FROM information_schema.tables LIMIT 10;",
    "SHOW TABLES;",
    "SELECT NOW();",
  ];

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!database) return;
    setTables([]);
    setSchemaSearch("");
    setSelectedTable(null);
    setTableDetails(null);
    setSchemaError(null);
    setTableSchemaError(null);
    setConnectionError(null);
    setConnectionLatency(null);
    setQueryResult(null);
    setLogs([]);
  }, [database?.id]);

  useEffect(() => {
    if (!isOpen || !database) return;

    if (activeTab === "schema") {
      fetchSchema();
    } else if (activeTab === "logs") {
      fetchLogs();
    }
  }, [isOpen, database?.id, activeTab]);

  const handleTestConnection = async () => {
    if (!database) return;
    setTestingConnection(true);
    setConnectionError(null);
    try {
      const res = await databaseApi.testConnection(database.id);
      if (res.success) {
        setConnectionLatency(res.latencyMs ?? 15);
        toast.add({
          type: "success",
          title: `Connection successful (${res.latencyMs ?? 15}ms)`,
        });
      } else {
        setConnectionError(res.message);
        toast.add({ type: "error", title: `Connection failed: ${res.message}` });
      }
    } catch (err: unknown) {
      setConnectionError(err instanceof Error ? err.message : "Failed to reach database");
    } finally {
      setTestingConnection(false);
    }
  };

  const fetchSchema = async () => {
    if (!database) return;
    setLoadingSchema(true);
    setSchemaError(null);
    try {
      const data = await databaseApi.getSchema(database.id);
      if (data?.error) {
        setSchemaError(data.error);
      } else if (data && Array.isArray(data.tables)) {
        const normalized: TableMeta[] = data.tables
          .map((t) => {
            if (!t) return null;
            if (typeof t === "string") return { table_name: t, table_type: "" };
            return {
              table_name: t.table_name ?? t.TABLE_NAME ?? "",
              table_type: t.table_type ?? t.TABLE_TYPE ?? "",
            };
          })
          .filter((t): t is TableMeta => Boolean(t?.table_name));

        setTables(normalized);
        if (normalized.length > 0 && !selectedTable) {
          handleSelectTable(normalized[0].table_name);
        }
      } else if (typeof data?.message === "string") {
        toast.add({ type: "info", title: data.message });
      }
    } catch (err: unknown) {
      setSchemaError(err instanceof Error ? err.message : "Failed to load schema");
    } finally {
      setLoadingSchema(false);
    }
  };

  const handleSelectTable = async (tableName: string) => {
    if (!database) return;
    setSelectedTable(tableName);
    setTableSchemaError(null);
    setTableDetails(null);
    setLoadingTableSchema(true);
    try {
      const data = await databaseApi.getTableSchema(database.id, tableName);

      if (data && Array.isArray(data.columns)) {
        setTableDetails({
          columns: data.columns ?? [],
          indexes: data.indexes ?? [],
          foreignKeys: data.foreignKeys ?? [],
        });
      } else {
        setTableSchemaError("No schema details were returned for the selected table.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load table details";
      setTableSchemaError(message);
      toast.add({ type: "error", title: message });
    } finally {
      setLoadingTableSchema(false);
    }
  };

  const handleRunQuery = async (queryToRun?: string) => {
    if (!database) return;
    const q = queryToRun || sqlQuery;
    if (!q.trim()) return;

    setRunningQuery(true);
    setQueryResult(null);
    try {
      const res = await databaseApi.executeQuery(database.id, q);
      setQueryResult(res);
      if (res.success) {
        toast.add({
          type: "success",
          title: `Returned ${res.rowCount} row(s) in ${res.executionTimeMs}ms`,
        });
      }
    } catch (err: unknown) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Query execution failed" });
    } finally {
      setRunningQuery(false);
    }
  };

  const fetchLogs = async () => {
    if (!database) return;
    setLoadingLogs(true);
    try {
      const data = await databaseApi.getLogs(database.id);
      setLogs(data);
    } catch (err: unknown) {
      toast.add({ type: "error", title: err instanceof Error ? err.message : "Failed to load query logs" });
    } finally {
      setLoadingLogs(false);
    }
  };

  const filteredTables = tables.filter((t) =>
    t.table_name?.toLowerCase().includes(schemaSearch.toLowerCase())
  );

  const isTypingTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    );
  };

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (
        activeTab === "playground" &&
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        if (!runningQuery) {
          handleRunQuery();
        }
        return;
      }

      if (
        activeTab === "schema" &&
        (event.key === "ArrowDown" || event.key === "ArrowUp")
      ) {
        if (isTypingTarget(event.target) || filteredTables.length === 0) return;

        event.preventDefault();
        const currentIndex = filteredTables.findIndex(
          (t) => t.table_name === selectedTable
        );

        let nextIndex = 0;
        if (event.key === "ArrowDown") {
          nextIndex =
            currentIndex < 0 || currentIndex === filteredTables.length - 1
              ? 0
              : currentIndex + 1;
        } else {
          nextIndex =
            currentIndex <= 0
              ? filteredTables.length - 1
              : currentIndex - 1;
        }

        const nextTable = filteredTables[nextIndex]?.table_name;
        if (nextTable && nextTable !== selectedTable) {
          handleSelectTable(nextTable);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isOpen,
    onClose,
    activeTab,
    runningQuery,
    filteredTables,
    selectedTable,
  ]);

  if (!isOpen || !database) return null;

  const isMysql = database.type === "mysql";
  const connectionUri = `${isMysql ? "mysql" : "postgresql"}://${database.username}:<password>@${database.host}:${database.port}/${database.databaseName}${database.ssl ? "?ssl=true" : ""}`;
  const mainCliCmd = isMysql
    ? `mysql -h ${database.host} -P ${database.port} -u ${database.username} -p ${database.databaseName}`
    : `psql "${connectionUri}"`;

  const generateAgentConfig = () => {
    const mcpUrl = "http://localhost:4080/mcp";
    if (selectedClient === "claude_desktop") {
      return JSON.stringify(
        {
          mcpServers: {
            "db-mcp-gateway": {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-fetch", mcpUrl],
              env: {
                MCP_GATEWAY_TOKEN: "<YOUR_MCP_TOKEN>",
              },
            },
          },
        },
        null,
        2
      );
    }
    if (selectedClient === "cursor") {
      return JSON.stringify(
        {
          mcpServers: {
            "db-mcp": {
              url: mcpUrl,
              headers: {
                Authorization: "Bearer <YOUR_MCP_TOKEN>",
              },
            },
          },
        },
        null,
        2
      );
    }
    if (selectedClient === "claude_code") {
      return `claude mcp add --transport http db-gateway ${mcpUrl} --header "Authorization: Bearer <YOUR_MCP_TOKEN>"`;
    }
    return JSON.stringify(
      {
        mcp: {
          serverUrl: mcpUrl,
          dbId: database.id,
        },
      },
      null,
      2
    );
  };

  const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: Zap },
    { id: "schema", label: "Schema", icon: Table },
    { id: "playground", label: "SQL", icon: Play },
    { id: "logs", label: "Logs", icon: History },
    { id: "agent", label: "Config", icon: Code },
  ];

  const selectedTableMeta = filteredTables.find((t) => t.table_name === selectedTable);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-screen w-full md:w-[640px] lg:w-[760px] bg-background shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0 shadow-sm">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-foreground truncate">{database.name}</h2>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {database.host}:{database.port}/{database.databaseName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant={database.status === "enabled" ? "secondary" : "outline"}
              className={database.status === "enabled" ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${database.status === "enabled" ? "bg-primary/10 animate-pulse" : "bg-muted"}`} />
              {database.status}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {testingConnection ? "Testing..." : "Test"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-muted-foreground hover:text-muted-foreground"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Tabs + Content */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as TabType)}
          className="flex flex-col flex-1 overflow-hidden"
        >
        <div className="sticky top-0 z-20 border-b border-border bg-background px-6 py-3 backdrop-blur">
          <TabsList className="w-full">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex-1">
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <TabsContent value="overview">
            <div className="space-y-4">
              <Card className="p-4 border-primary/30">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-muted-foreground">Connection Health</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {connectionLatency !== null
                        ? `Latency: ${connectionLatency}ms (latest check)`
                        : "Click to test connection"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={testingConnection}
                    onClick={handleTestConnection}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    {testingConnection ? "Checking..." : "Run Check"}
                  </Button>
                </div>
              </Card>

              {connectionError && (
                <Card className="p-3 bg-destructive/10 border-destructive/30">
                  <p className="text-xs text-destructive">{connectionError}</p>
                </Card>
              )}

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-muted-foreground">Details</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => copyToClipboard(mainCliCmd, "CLI command")}
                  >
                    {copiedSnippet === "CLI command" ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy CLI
                      </>
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground font-medium">Type</p>
                    <p className="text-muted-foreground font-semibold mt-0.5">
                      {isMysql ? "MySQL" : "PostgreSQL"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">Status</p>
                    <p className="text-muted-foreground font-semibold mt-0.5">{database.status}</p>
                  </div>
                  {database.environment && (
                    <div>
                      <p className="text-muted-foreground font-medium">Environment</p>
                      <p className="text-muted-foreground font-semibold mt-0.5">{database.environment}</p>
                    </div>
                  )}
                  {database.ssl && (
                    <div>
                      <p className="text-muted-foreground font-medium">SSL</p>
                      <p className="text-primary font-semibold mt-0.5">Enabled</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-muted p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">CLI</p>
                  <code className="text-xs text-primary font-mono break-all">{mainCliCmd}</code>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="schema">
            <div className="space-y-4">
              {loadingSchema ? (
                <Spinner label="Loading schema…" />
              ) : schemaError ? (
                <Card className="p-4 bg-destructive/10 border-destructive/30">
                  <p className="text-sm text-destructive">{schemaError}</p>
                  <Button size="sm" variant="secondary" onClick={fetchSchema} className="mt-3">
                    Retry
                  </Button>
                </Card>
              ) : tables.length === 0 ? (
                <Card className="p-4 text-center">
                  <Table className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground font-semibold">No tables found</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
                    <Card className="p-3 space-y-3 h-fit">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tables</p>
                        <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border">
                          {filteredTables.length}
                        </Badge>
                      </div>

                      <p className="text-[10px] text-muted-foreground">
                        Shortcut: use Arrow Up/Down to move between tables
                      </p>

                      <div className="relative">
                        <Filter className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Filter tables"
                          value={schemaSearch}
                          onChange={(e) => setSchemaSearch(e.target.value)}
                          className="pl-8 text-xs"
                        />
                      </div>

                      <div className="max-h-[52vh] overflow-y-auto space-y-1.5 pr-1">
                        {filteredTables.map((t) => (
                          <button
                            key={t.table_name}
                            className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                              selectedTable === t.table_name
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-transparent bg-muted text-muted-foreground hover:border-border hover:bg-background"
                            }`}
                            onClick={() => handleSelectTable(t.table_name)}
                          >
                            <p className="font-mono text-xs font-semibold truncate">{t.table_name}</p>
                            {t.table_type && (
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                                {t.table_type}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    </Card>

                    <Card className="p-4 space-y-4">
                      {loadingTableSchema ? (
                        <Spinner label="Loading table details..." />
                      ) : tableSchemaError ? (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4">
                          <p className="text-xs text-destructive">{tableSchemaError}</p>
                          {selectedTable && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="mt-3"
                              onClick={() => handleSelectTable(selectedTable)}
                            >
                              Retry
                            </Button>
                          )}
                        </div>
                      ) : selectedTable && tableDetails ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Selected table</p>
                              <h4 className="font-mono font-bold text-muted-foreground text-sm mt-0.5">
                                {selectedTableMeta?.table_name}
                              </h4>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                                <Columns className="w-3 h-3" />
                                {tableDetails.columns.length} cols
                              </Badge>
                              <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border">
                                <TableProperties className="w-3 h-3" />
                                {tableDetails.indexes.length} idx
                              </Badge>
                              <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border">
                                <Layers className="w-3 h-3" />
                                {tableDetails.foreignKeys.length} fk
                              </Badge>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Columns</p>
                            <div className="max-h-[26vh] overflow-auto rounded-lg border border-border">
                              <table className="w-full text-xs">
                                <thead className="bg-muted sticky top-0">
                                  <tr>
                                    <th className="px-2.5 py-2 text-left font-semibold text-muted-foreground">Name</th>
                                    <th className="px-2.5 py-2 text-left font-semibold text-muted-foreground">Type</th>
                                    <th className="px-2.5 py-2 text-left font-semibold text-muted-foreground">Nullable</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tableDetails.columns.map((col) => (
                                    <tr key={col.column_name} className="border-t border-border">
                                      <td className="px-2.5 py-2 font-mono text-muted-foreground">{col.column_name}</td>
                                      <td className="px-2.5 py-2 text-muted-foreground">{col.data_type ?? "-"}</td>
                                      <td className="px-2.5 py-2 text-muted-foreground">{col.is_nullable ?? "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {tableDetails.indexes.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Indexes</p>
                              <div className="flex flex-wrap gap-1.5">
                                {tableDetails.indexes.slice(0, 12).map((idx, i) => (
                                  <Badge key={`${idx.index_name}-${i}`} variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border">
                                    {idx.index_name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {tableDetails.foreignKeys.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Foreign keys</p>
                              <div className="space-y-1.5">
                                {tableDetails.foreignKeys.slice(0, 8).map((fk, i) => (
                                  <div
                                    key={`${fk.column_name}-${i}`}
                                    className="rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs"
                                  >
                                    <span className="font-mono text-muted-foreground">{fk.column_name}</span>
                                    <span className="text-muted-foreground"> → {fk.foreign_table}.{fk.foreign_column}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border bg-muted px-4 py-10 text-center">
                          <Table className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">Select a table from the left to inspect structure.</p>
                        </div>
                      )}
                    </Card>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="playground">
            <div className="space-y-4">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-muted-foreground">SQL Playground</h3>
                  <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                    Read-only enforced
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {queryPresets.map((preset) => (
                    <Button
                      key={preset}
                      variant="outline"
                      size="sm"
                      className="text-[11px]"
                      onClick={() => setSqlQuery(preset)}
                    >
                      {preset.startsWith("SELECT") ? "SELECT" : preset.startsWith("SHOW") ? "SHOW" : "NOW"}
                    </Button>
                  ))}
                </div>

                <Textarea
                  rows={7}
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="SELECT * FROM table LIMIT 10;"
                  className="font-mono text-xs bg-muted text-primary"
                />
                <p className="text-[11px] text-muted-foreground">
                  Shortcut: press Cmd/Ctrl + Enter to run query
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleRunQuery()}
                    disabled={runningQuery}
                    className="flex-1"
                  >
                    <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                    {runningQuery ? "Running..." : "Run Query"}
                  </Button>
                </div>
              </Card>

              {queryResult && (
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-muted-foreground">
                      Results: {queryResult.rowCount} rows
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {queryResult.executionTimeMs} ms
                    </div>
                  </div>
                  {queryResult.error && (
                    <p className="text-xs text-destructive mt-1">{queryResult.error}</p>
                  )}
                  {queryResult.rows.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted">
                          <tr>
                            {queryResult.columns.map((col) => (
                              <th key={col} className="px-2.5 py-2 text-left font-bold text-muted-foreground border-b border-border">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.rows.slice(0, 20).map((row, idx) => (
                            <tr key={idx} className="border-b border-border last:border-b-0">
                              {queryResult.columns.map((col) => (
                                <td key={col} className="px-2.5 py-2 text-muted-foreground align-top truncate max-w-[160px]">
                                  {String(row[col] ?? "")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="logs">
            <div className="space-y-3">
              {loadingLogs ? (
                <Spinner label="Loading logs…" />
              ) : logs.length === 0 ? (
                <Card className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">No query logs yet</p>
                </Card>
              ) : (
                logs.slice(0, 20).map((log) => (
                  <Card key={log.id} className="p-3 space-y-2">
                    <div className="flex items-center gap-2 justify-between">
                      <Badge
                        variant={log.status === "success" ? "secondary" : "destructive"}
                        className={log.status === "success" ? "bg-primary/10 text-primary border-primary/30" : undefined}
                      >
                        {log.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <code className="text-xs text-muted-foreground block bg-muted p-2 rounded break-all">
                      {log.query}
                    </code>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Rows: {log.rowCount ?? 0}</span>
                      <span>{log.executionTimeMs ?? 0} ms</span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="agent">
            <div className="space-y-4">
              <Card className="p-4 space-y-3">
                <h3 className="text-sm font-bold text-muted-foreground">AI Client Configuration</h3>
                <div className="flex gap-1 bg-muted p-1 rounded-lg overflow-x-auto">
                  {(["claude_desktop", "cursor", "claude_code", "windsurf"] as const).map((client) => (
                    <Button
                      key={client}
                      variant={selectedClient === client ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setSelectedClient(client)}
                      className="text-xs whitespace-nowrap"
                    >
                      {client.replace("_", " ")}
                    </Button>
                  ))}
                </div>
                <pre className="text-xs bg-muted text-primary p-3 rounded-lg overflow-x-auto">
                  {generateAgentConfig()}
                </pre>
                <Button
                  onClick={() => copyToClipboard(generateAgentConfig(), selectedClient)}
                  className="w-full"
                >
                  {copiedSnippet === selectedClient ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1 text-primary" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      Copy Config
                    </>
                  )}
                </Button>
              </Card>
            </div>
          </TabsContent>
        </div>
        </Tabs>
      </div>
    </>
  );
}
