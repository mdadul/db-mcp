import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FolderTree, RefreshCw, Search, Star, Table2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/Skeleton";
import { databaseApi } from "../api/databaseApi";
import type { DatabaseConnection, SchemaTree } from "../types";
import { tableKey, type TableRef } from "./model";
import { useFavouriteTables } from "./useFavouriteTables";

type SchemaTable = SchemaTree["schemas"][number]["tables"][number];

/** Indentation in px, relative to the connection's child guide line. */
const SCHEMA_INDENT = 4;
const TABLE_INDENT = 22;
const COLUMN_INDENT = 46;

const formatEstimate = (value: number | null) => (value === null ? "" : value.toLocaleString());

/** Arrow keys move focus between the visible treeitems of the enclosing tree. */
export function moveTreeFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const rows = [...(event.currentTarget.closest("[role='tree']")?.querySelectorAll<HTMLElement>("[role='treeitem']") ?? [])];
  const index = rows.indexOf(event.currentTarget);
  rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
}

/** Schemas, favourites and tables of one connection. Rendered under its connection row in the explorer. */
export function ConnectionTree({ connection, selectedTable, recentTables, onOpenData, onOpenStructure, onQuery, onCopy, onEnable }: {
  connection: DatabaseConnection;
  /** Only the selected connection highlights a table. */
  selectedTable: TableRef | null;
  recentTables: TableRef[];
  onOpenData: (schema: string, table: string) => void;
  onOpenStructure: (schema: string, table: string) => void;
  onQuery: (schema: string, table: string) => void;
  onCopy: (value: string) => void;
  onEnable: () => void;
}) {
  const queryClient = useQueryClient();
  const favourites = useFavouriteTables(connection.id);
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [collapsedSchemas, setCollapsedSchemas] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<{ schema: string; table: string; x: number; y: number } | null>(null);
  const enabled = connection.status === "enabled";

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedFilter(filter), 150); return () => window.clearTimeout(timer); }, [filter]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", close); };
  }, [menu]);

  // Same key as the workbench's unfiltered schema query, so autocomplete and this tree share one cache entry.
  const schemaQuery = useQuery({ queryKey: ["database-schema", connection.id, debouncedFilter], queryFn: () => databaseApi.getSchemaTree(connection.id, debouncedFilter || undefined), enabled, retry: 1, staleTime: 30_000 });
  const tree = schemaQuery.data;

  const byKey = useMemo(() => new Map((tree?.schemas ?? []).flatMap((schema) => schema.tables.map((table) => [tableKey({ schema: schema.name, name: table.name }), { schema: schema.name, table }] as const))), [tree]);
  const resolve = (keys: readonly string[]) => keys.flatMap((key) => { const hit = byKey.get(key); return hit ? [hit] : []; });
  const favouriteRows = resolve(favourites.favouriteKeys);
  const recentRows = resolve(recentTables.map(tableKey));

  const setSchemaOpen = (name: string, open: boolean) => setCollapsedSchemas((current) => {
    const next = new Set(current);
    if (open) next.delete(name);
    else next.add(name);
    return next;
  });

  if (!enabled) return <p role="status" className="mx-1 my-1 rounded-md border border-warning/30 bg-warning-subtle p-2 text-ui-xs">
    Disabled. <button type="button" className="font-medium text-primary underline" onClick={onEnable}>Enable to browse</button>
  </p>;

  const renderRow = (scope: string, schema: string, table: SchemaTable) => {
    const ref: TableRef = { schema, name: table.name };
    const key = tableKey(ref);
    return <SchemaTableRow key={`${scope}:${key}`} connectionId={connection.id} schema={schema} table={table} selected={selectedTable?.schema === schema && selectedTable.name === table.name} favourite={favourites.favouriteKeys.includes(key)} onToggleFavourite={() => favourites.toggle(ref)} onOpenData={onOpenData} onOpenStructure={onOpenStructure} onContextMenu={(event) => { event.preventDefault(); setMenu({ schema, table: table.name, x: event.clientX, y: event.clientY }); }} />;
  };

  return <div className="flex min-w-0 flex-col">
    <div className="flex h-7 min-w-0 items-center gap-1 pr-1 text-muted-foreground">
      <Search className="ml-1 size-3 shrink-0" />
      <Input aria-label={`Filter tables in ${connection.name}`} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter tables…" className="h-6 min-w-0 flex-1 border-0 bg-transparent px-0 text-ui-xs shadow-none focus-visible:ring-0" />
      <Button variant="ghost" size="icon-xs" aria-label="Refresh schema" title="Refresh schema" onClick={() => void queryClient.invalidateQueries({ queryKey: ["database-schema", connection.id] })}><RefreshCw /></Button>
    </div>
    {schemaQuery.isLoading ? <div className="space-y-1.5 py-1" role="status" aria-label="Loading schema">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-5 w-full" key={index} />)}</div>
      : schemaQuery.isError ? <div className="p-2 text-ui-xs text-danger" role="alert">{schemaQuery.error.message}<Button variant="ghost" size="xs" onClick={() => void schemaQuery.refetch()}>Retry</Button></div>
        : !tree?.schemas.length ? <p className="px-2 py-2 text-ui-xs text-muted-foreground">{filter ? "No tables match this filter." : "This database has no visible tables or collections."}</p>
          : <>
            {favouriteRows.length > 0 && <TreeGroup title="Favourites">{favouriteRows.map(({ schema, table }) => renderRow("favourite", schema, table))}</TreeGroup>}
            {recentRows.length > 0 && <TreeGroup title="Recent">{recentRows.map(({ schema, table }) => renderRow("recent", schema, table))}</TreeGroup>}
            {(favouriteRows.length > 0 || recentRows.length > 0) && <p className="px-2 pb-0.5 pt-1.5 text-ui-xs font-semibold uppercase tracking-wide text-muted-foreground">All tables</p>}
            {tree.schemas.map((schema) => {
              const open = !collapsedSchemas.has(schema.name);
              return <div key={schema.name} role="none">
                <button type="button" role="treeitem" aria-expanded={open} className="flex h-7 w-full items-center gap-1 rounded pr-2 text-left text-ui-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" style={{ paddingLeft: SCHEMA_INDENT }} onClick={() => setSchemaOpen(schema.name, !open)} onKeyDown={(event) => { if (event.key === "ArrowRight") setSchemaOpen(schema.name, true); else if (event.key === "ArrowLeft") setSchemaOpen(schema.name, false); else moveTreeFocus(event); }}>
                  <ChevronRight className={`size-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
                  <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{schema.name}</span>
                  <span className="text-ui-xs tabular-nums text-muted-foreground">{schema.tables.length}</span>
                </button>
                {open && <div role="group" aria-label={`${schema.name} tables`}>{schema.tables.map((table) => renderRow("schema", schema.name, table))}</div>}
              </div>;
            })}
          </>}
    {menu && <div role="menu" aria-label={`${menu.table} actions`} className="fixed z-50 min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg" style={{ left: Math.min(menu.x, window.innerWidth - 180), top: Math.min(menu.y, window.innerHeight - 180) }}>
      <ContextItem label="Open data" action={() => onOpenData(menu.schema, menu.table)} />
      <ContextItem label="Open structure" action={() => onOpenStructure(menu.schema, menu.table)} />
      <ContextItem label="New query here" action={() => onQuery(menu.schema, menu.table)} />
      <ContextItem label={favourites.favouriteKeys.includes(tableKey({ schema: menu.schema, name: menu.table })) ? "Remove from favourites" : "Add to favourites"} action={() => favourites.toggle({ schema: menu.schema, name: menu.table })} />
      <ContextItem label="Copy name" action={() => onCopy(menu.table)} />
    </div>}
  </div>;
}

function TreeGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mb-0.5">
    <p className="px-2 pb-0.5 pt-1.5 text-ui-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
    {children}
  </div>;
}

function SchemaTableRow({ connectionId, schema, table, selected, favourite, onToggleFavourite, onOpenData, onOpenStructure, onContextMenu }: { connectionId: string; schema: string; table: SchemaTable; selected: boolean; favourite: boolean; onToggleFavourite: () => void; onOpenData: (schema: string, table: string) => void; onOpenStructure: (schema: string, table: string) => void; onContextMenu: (event: MouseEvent<HTMLDivElement>) => void }) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const structure = useQuery({ queryKey: ["table-structure", connectionId, schema, table.name], queryFn: () => databaseApi.getTableStructure(connectionId, table.name, schema), enabled: columnsOpen });
  const starLabel = `${favourite ? "Remove" : "Add"} ${table.name} ${favourite ? "from" : "to"} favourites`;
  return <div role="none" className="min-w-0 overflow-hidden">
    <div role="treeitem" aria-selected={selected} aria-expanded={columnsOpen} tabIndex={0} className={`group flex h-7 min-w-0 items-center gap-1 overflow-hidden rounded pr-1 text-ui-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-accent-subtle" : ""}`} style={{ paddingLeft: TABLE_INDENT }} onClick={() => onOpenData(schema, table.name)} onDoubleClick={() => onOpenStructure(schema, table.name)} onContextMenu={onContextMenu} onKeyDown={(event) => {
      if (event.key === "Enter") onOpenData(schema, table.name);
      else if (event.key === "ArrowRight") setColumnsOpen(true);
      else if (event.key === "ArrowLeft") setColumnsOpen(false);
      else moveTreeFocus(event);
    }}>
      <button type="button" aria-label={`${columnsOpen ? "Collapse" : "Expand"} ${table.name} columns`} className="flex size-4 shrink-0 items-center justify-center rounded hover:bg-background" onClick={(event) => { event.stopPropagation(); setColumnsOpen((current) => !current); }}><ChevronRight className={`size-3 transition-transform ${columnsOpen ? "rotate-90" : ""}`} /></button>
      <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate" title={table.name}>{table.name}</span>
      <button type="button" aria-pressed={favourite} aria-label={starLabel} title={starLabel} className={`flex size-4 shrink-0 items-center justify-center rounded hover:bg-background ${favourite ? "text-warning" : "text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100"}`} onClick={(event) => { event.stopPropagation(); onToggleFavourite(); }}><Star className={`size-3 ${favourite ? "fill-current" : ""}`} /></button>
      <span className="shrink-0 pr-1 text-ui-xs tabular-nums text-muted-foreground">{formatEstimate(table.rowEstimate)}</span>
    </div>
    {columnsOpen && <div className="relative overflow-hidden py-0.5">
      {structure.isLoading ? <div style={{ paddingLeft: COLUMN_INDENT }} className="py-0.5"><Skeleton className="h-4 w-3/4" /></div>
        : structure.isError ? <p style={{ paddingLeft: COLUMN_INDENT }} className="py-0.5 text-ui-xs text-danger">Could not load columns</p>
          : structure.data?.columns.map((column) => <div key={column.name} style={{ paddingLeft: COLUMN_INDENT }} className="flex h-6 min-w-0 items-center gap-1 overflow-hidden pr-1 text-ui-xs text-muted-foreground"><span className="min-w-0 flex-1 truncate font-mono">{column.name}</span><span className="max-w-24 truncate">{column.dataType}</span><span className="w-7 shrink-0 text-center" title={column.isPrimaryKey ? "Primary key" : column.nullable ? "Nullable" : "Not nullable"}>{column.isPrimaryKey ? "PK" : column.nullable ? "" : "•"}</span></div>)}
    </div>}
  </div>;
}

function ContextItem({ label, action }: { label: string; action: () => void }) {
  return <button role="menuitem" className="flex h-7 w-full items-center rounded px-2 text-left text-ui-xs hover:bg-muted" onClick={action}>{label}</button>;
}
