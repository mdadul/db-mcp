import { useState, type MouseEvent } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FolderTree, RefreshCw, Search, Table2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { databaseApi } from "../api/databaseApi";
import type { DatabaseConnection, SchemaTree } from "../types";
import type { TableRef } from "./model";

const formatEstimate = (value: number | null) => (value === null ? "" : value.toLocaleString());

/** Schema tree with table filter, open/structure/query actions and inline column lists. */
export function SchemaPane({ connection, query, filter, onFilter, selectedTable, collapsed, onCollapse, onRefresh, onOpenData, onOpenStructure, onQuery, onCopy, onEnable }: {
  connection: DatabaseConnection | undefined;
  query: UseQueryResult<SchemaTree>;
  filter: string;
  onFilter: (value: string) => void;
  selectedTable: TableRef | null;
  collapsed: boolean;
  onCollapse: () => void;
  onRefresh: () => void;
  onOpenData: (schema: string, table: string) => void;
  onOpenStructure: (schema: string, table: string) => void;
  onQuery: (schema: string, table: string) => void;
  onCopy: (value: string) => void;
  onEnable: (connection: DatabaseConnection) => void;
}) {
  return <section className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-border bg-surface ${collapsed ? "hidden" : ""}`} aria-label="Database schema pane">
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2"><span className="flex-1 text-ui-xs font-semibold">Schema</span>{connection && <Button variant="ghost" size="icon-xs" aria-label="Refresh schema" title="Refresh schema" onClick={onRefresh}><RefreshCw /></Button>}<Button variant="ghost" size="icon-xs" aria-label="Collapse schema pane" onClick={onCollapse}><ChevronDown className="rotate-90" /></Button></div>
    {!connection ? null : connection.status === "disabled" ? <div className="m-2 rounded-md border border-warning/30 bg-warning-subtle p-3 text-ui-xs" role="status">This connection is disabled. <button className="font-medium text-primary underline" onClick={() => onEnable(connection)}>Enable to load schema</button></div> : <>
      <label className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2 text-muted-foreground"><Search className="size-3.5" /><Input value={filter} onChange={(event) => onFilter(event.target.value)} placeholder="Filter tables…" className="h-7 border-0 bg-transparent px-0 text-ui-xs shadow-none focus-visible:ring-0" /></label>
      {query.isLoading ? <div className="space-y-2 p-2" role="status" aria-label="Loading schema">{Array.from({ length: 8 }, (_, index) => <Skeleton className="h-6 w-full" key={index} />)}</div>
        : query.isError ? <div className="p-3 text-ui-xs text-danger" role="alert">{query.error.message}<Button variant="ghost" size="xs" onClick={() => void query.refetch()}>Retry</Button></div>
          : query.data?.schemas.length ? <SchemaTreePane connectionId={connection.id} tree={query.data} selectedTable={selectedTable} onOpenData={onOpenData} onOpenStructure={onOpenStructure} onQuery={onQuery} onCopy={onCopy} />
            : <EmptyState title="No tables found" description={filter ? "Try a different filter." : "This database has no visible tables or collections."} />}
    </>}
  </section>;
}

function SchemaTreePane({ connectionId, tree, selectedTable, onOpenData, onOpenStructure, onQuery, onCopy }: { connectionId: string; tree: SchemaTree; selectedTable: TableRef | null; onOpenData: (schema: string, table: string) => void; onOpenStructure: (schema: string, table: string) => void; onQuery: (schema: string, table: string) => void; onCopy: (value: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.schemas.map((schema) => schema.name)));
  const [menu, setMenu] = useState<{ schema: string; table: string; x: number; y: number } | null>(null);
  const toggleSchema = (name: string) => setExpanded((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  return <div role="tree" aria-label="Database schema" className="min-h-0 flex-1 overflow-auto p-1">
    {tree.schemas.map((schema) => <div key={schema.name}>
      <button role="treeitem" aria-expanded={expanded.has(schema.name)} className="flex h-7 w-full items-center gap-1 rounded px-2 text-left text-ui-xs font-medium hover:bg-muted" onClick={() => toggleSchema(schema.name)}><ChevronRight className={`size-3 transition-transform ${expanded.has(schema.name) ? "rotate-90" : ""}`} /><FolderTree className="size-3.5 text-muted-foreground" />{schema.name}<span className="ml-auto text-ui-xs text-muted-foreground">{schema.tables.length}</span></button>
      {expanded.has(schema.name) && schema.tables.map((table) => <SchemaTableRow key={`${schema.name}.${table.name}`} connectionId={connectionId} schema={schema.name} table={table} selected={selectedTable?.schema === schema.name && selectedTable.name === table.name} onOpenData={onOpenData} onOpenStructure={onOpenStructure} onContextMenu={(event) => { event.preventDefault(); setMenu({ schema: schema.name, table: table.name, x: event.clientX, y: event.clientY }); }} />)}
    </div>)}
    {menu && <div role="menu" className="fixed z-50 min-w-40 rounded-md border border-border bg-popover p-1 shadow-lg" style={{ left: Math.min(menu.x, window.innerWidth - 180), top: Math.min(menu.y, window.innerHeight - 150) }}><ContextItem label="Open data" action={() => onOpenData(menu.schema, menu.table)} /><ContextItem label="Open structure" action={() => onOpenStructure(menu.schema, menu.table)} /><ContextItem label="New query here" action={() => onQuery(menu.schema, menu.table)} /><ContextItem label="Copy name" action={() => onCopy(menu.table)} /></div>}
  </div>;
}

function SchemaTableRow({ connectionId, schema, table, selected, onOpenData, onOpenStructure, onContextMenu }: { connectionId: string; schema: string; table: SchemaTree["schemas"][number]["tables"][number]; selected: boolean; onOpenData: (schema: string, table: string) => void; onOpenStructure: (schema: string, table: string) => void; onContextMenu: (event: MouseEvent<HTMLDivElement>) => void }) {
  const [expanded, setExpanded] = useState(false);
  const structure = useQuery({ queryKey: ["table-structure", connectionId, schema, table.name], queryFn: () => databaseApi.getTableStructure(connectionId, table.name, schema), enabled: expanded });
  const toggleColumns = (event: MouseEvent<HTMLElement>) => { event.stopPropagation(); setExpanded((current) => !current); };
  return <div className="min-w-0 overflow-hidden">
    <div role="treeitem" aria-selected={selected} aria-expanded={expanded} tabIndex={0} className={`group flex h-7 min-w-0 items-center gap-1 overflow-hidden rounded pr-1 text-ui-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-accent-subtle" : ""}`} style={{ paddingLeft: 26 }} onClick={() => onOpenData(schema, table.name)} onDoubleClick={() => onOpenStructure(schema, table.name)} onContextMenu={onContextMenu} onKeyDown={(event) => { if (event.key === "Enter") onOpenData(schema, table.name); else if (event.key === "ArrowRight") toggleColumns(event as unknown as MouseEvent<HTMLElement>); }}>
      <button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${table.name} columns`} className="flex size-4 shrink-0 items-center justify-center rounded hover:bg-background" onClick={toggleColumns}><ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} /></button><Table2 className="size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate" title={table.name}>{table.name}</span><span className="shrink-0 text-ui-xs tabular-nums text-muted-foreground">{formatEstimate(table.rowEstimate)}</span>
    </div>
    {expanded && <div className="relative overflow-hidden">{structure.isLoading ? <Skeleton className="ml-12 my-1 h-5 w-3/4" /> : structure.isError ? <p className="pl-12 py-1 text-ui-xs text-danger">Could not load columns</p> : structure.data?.columns.map((column) => <div key={column.name} className="flex h-6 min-w-0 items-center gap-1 overflow-hidden pl-12 text-ui-xs text-muted-foreground"><span className="min-w-0 flex-1 truncate font-mono">{column.name}</span><span className="max-w-24 truncate">{column.dataType}</span><span className="w-7 shrink-0 text-center" title={column.isPrimaryKey ? "Primary key" : column.nullable ? "Nullable" : "Not nullable"}>{column.isPrimaryKey ? "PK" : column.nullable ? "" : "•"}</span></div>)}</div>}
  </div>;
}

function ContextItem({ label, action }: { label: string; action: () => void }) {
  return <button role="menuitem" className="flex h-7 w-full items-center rounded px-2 text-left text-ui-xs hover:bg-muted" onClick={(event) => { event.stopPropagation(); action(); }}>{label}</button>;
}
