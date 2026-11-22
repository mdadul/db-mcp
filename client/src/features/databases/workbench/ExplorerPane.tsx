import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Bot, ChevronRight, Download, ListFilter, MoreHorizontal, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DbEngineIcon } from "@/components/brand/DbEngineIcon";
import type { DatabaseConnection } from "../types";
import { EnvironmentTag } from "./EnvironmentTag";
import { moveTreeFocus } from "./ConnectionTree";
import { connectionStatus, connectionSubtitle, groupedConnections, type GroupMode, type TestState } from "./model";

/** Connection tree with search, grouping, favourites and per-row actions. Each expanded connection shows its schema tree inline. */
export function ExplorerPane({ query, selectedId, testStates, searchRef, renderTree, onSelect, onOpenMenu, onAdd, onExport }: {
  query: UseQueryResult<DatabaseConnection[]>;
  selectedId: string;
  testStates: Record<string, TestState>;
  searchRef: RefObject<HTMLInputElement | null>;
  renderTree: (item: DatabaseConnection) => ReactNode;
  onSelect: (item: DatabaseConnection) => void;
  onOpenMenu: (item: DatabaseConnection, x: number, y: number) => void;
  onAdd: () => void;
  onExport: () => void;
}) {
  const connections = query.data ?? [];
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("status");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(selectedId ? [selectedId] : []));
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 150); return () => window.clearTimeout(timer); }, [search]);
  // Opening a connection elsewhere in the workbench (recent table, query, route) also expands it.
  useEffect(() => { if (selectedId) setExpandedIds((current) => current.has(selectedId) ? current : new Set(current).add(selectedId)); }, [selectedId]);

  const setExpanded = (id: string, open: boolean) => setExpandedIds((current) => {
    if (current.has(id) === open) return current;
    const next = new Set(current);
    if (open) next.add(id);
    else next.delete(id);
    return next;
  });

  const visible = useMemo(() => connections
    .filter((item) => `${item.name} ${item.host} ${item.databaseName} ${item.type} ${item.folder ?? ""} ${item.environment ?? ""}`.toLocaleLowerCase().includes(debouncedSearch.toLocaleLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)),
  [connections, debouncedSearch]);
  const favourites = visible.filter((item) => item.favourite);
  const groups: [string, DatabaseConnection[]][] = [
    ...(favourites.length ? [["Favourites", favourites] as [string, DatabaseConnection[]]] : []),
    ...groupedConnections(visible.filter((item) => !item.favourite), groupMode),
  ];

  return <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-border bg-surface" aria-label="Connections pane">
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
      <span className="flex-1 text-ui-xs font-semibold">Connections</span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Group connections"><ListFilter /></Button>} />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setGroupMode("status")}>Group by status</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setGroupMode("engine")}>Group by engine</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setGroupMode("folder")}>Group by folder</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="More connection actions"><MoreHorizontal /></Button>} />
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!connections.length} onClick={onExport}><Download />Export connection list</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon-xs" aria-label="Add connection" onClick={onAdd}><Plus /></Button>
    </div>
    <label className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2 text-muted-foreground"><Search className="size-3.5" /><Input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter connections…  ⌘F" className="h-7 border-0 bg-transparent px-0 text-ui-xs shadow-none focus-visible:ring-0" /></label>
    <div role="tree" aria-label="Database connections" className="min-h-0 flex-1 overflow-y-auto p-1">
      {query.isLoading ? <div className="space-y-2 p-2" role="status" aria-label="Loading connections">{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-11 w-full" key={index} />)}</div>
        : query.isError ? <div className="p-3 text-ui-xs text-danger" role="alert">{query.error.message}<Button variant="ghost" size="xs" onClick={() => void query.refetch()}>Retry</Button></div>
          : visible.length === 0 ? <EmptyState title={connections.length ? "No matching connections" : "No connections yet"} description={connections.length ? "Change the search to see other connections." : "Use the + button above to add a database, then browse its schema and run read-only queries."} />
            : groups.map(([group, items]) => <div key={group}><p className="px-2 pb-1 pt-2 text-ui-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>{items.map((item) => <ConnectionRow key={item.id} item={item} selected={selectedId === item.id} expanded={expandedIds.has(item.id)} testState={testStates[item.id]} onSelect={() => { setExpanded(item.id, true); onSelect(item); }} onToggle={(open) => setExpanded(item.id, open)} onMenu={(event) => { event.preventDefault(); event.stopPropagation(); onOpenMenu(item, event.clientX, event.clientY); }} onContextMenu={(event) => { event.preventDefault(); onOpenMenu(item, event.clientX, event.clientY); }}>{expandedIds.has(item.id) ? renderTree(item) : null}</ConnectionRow>)}</div>)}
    </div>
  </section>;
}

function ConnectionRow({ item, selected, expanded, testState, onSelect, onToggle, onMenu, onContextMenu, children }: { item: DatabaseConnection; selected: boolean; expanded: boolean; testState?: TestState; onSelect: () => void; onToggle: (open: boolean) => void; onMenu: (event: MouseEvent<HTMLButtonElement>) => void; onContextMenu: (event: MouseEvent<HTMLDivElement>) => void; children: ReactNode }) {
  const status = connectionStatus(item, testState);
  const subtitle = connectionSubtitle(item);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); }
    else if (event.key === "ArrowRight") onToggle(true);
    else if (event.key === "ArrowLeft") onToggle(false);
    else moveTreeFocus(event);
  };
  return <div role="none">
    <div role="treeitem" aria-selected={selected} aria-expanded={expanded} aria-label={`${item.name}, ${status?.label ?? "Not tested"}`} tabIndex={0} onClick={onSelect} onContextMenu={onContextMenu} onKeyDown={onKeyDown} className={`group flex h-12 min-w-0 cursor-default items-center gap-2 rounded px-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-accent-subtle text-foreground" : "text-muted-foreground"}`}>
      <button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${item.name}`} tabIndex={-1} className="flex size-4 shrink-0 items-center justify-center rounded hover:bg-background" onClick={(event) => { event.stopPropagation(); onToggle(!expanded); }}><ChevronRight className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} /></button>
      <DbEngineIcon type={item.type} className="size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5"><span className="min-w-0 truncate text-ui-sm font-medium text-foreground">{item.name}</span>{status && <Tooltip content={status.label}><span role="img" aria-label={status.label} className="inline-flex"><StatusDot state={status.state} /></span></Tooltip>}<EnvironmentTag environment={item.environment} /><span role="img" aria-label={item.status === "enabled" ? "AI access on" : "AI access off"} title={item.status === "enabled" ? "AI clients can query this connection" : "Disabled: AI clients cannot query this connection"} className={`inline-flex shrink-0 ${item.status === "enabled" ? "text-success" : "text-muted-foreground"}`}><Bot className="size-3.5" /></span></div>
        <p className="truncate text-ui-xs text-muted-foreground" title={subtitle.title}>{subtitle.text}</p>
      </div>
      <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${item.name}`} onClick={onMenu}><MoreHorizontal /></Button>
    </div>
    {expanded && <div role="group" aria-label={`${item.name} schema`} className="ml-[18px] border-l border-border pb-1 pl-1">{children}</div>}
  </div>;
}

export function ConnectionContextMenu({ item, point, onOpen, onEdit, onTest, onDuplicate, onCopyUrl, onCopyMcp, onToggle, onFavourite, onDelete }: { item: DatabaseConnection; point: { x: number; y: number }; onOpen: () => void; onEdit: () => void; onTest: () => void; onDuplicate: () => void; onCopyUrl: () => void; onCopyMcp: () => void; onToggle: () => void; onFavourite: () => void; onDelete: () => void }) {
  const style = { left: Math.min(point.x, window.innerWidth - 220), top: Math.min(point.y, window.innerHeight - 320) };
  const actions: [string, () => void][] = [["Open", onOpen], ["Edit", onEdit], ["Test connection", onTest], [item.favourite ? "Remove from favourites" : "Add to favourites", onFavourite], ["Duplicate", onDuplicate], ["Copy connection URL", onCopyUrl], ["Copy MCP config", onCopyMcp], [item.status === "enabled" ? "Disable" : "Enable", onToggle], ["Delete", onDelete]];
  return <div role="menu" aria-label={`${item.name} actions`} style={style} className="fixed z-50 min-w-52 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg" onClick={(event) => event.stopPropagation()}>
    {actions.map(([label, action]) => <button key={label} role="menuitem" className={`flex h-7 w-full items-center rounded px-2 text-left text-ui-sm hover:bg-muted ${label === "Delete" ? "text-danger" : ""}`} onClick={action}>{label}</button>)}
  </div>;
}
