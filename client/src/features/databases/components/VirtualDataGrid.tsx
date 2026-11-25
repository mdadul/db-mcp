import { memo, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  Filter,
  MoreHorizontal,
  Pin,
  PinOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  cellKind,
  downloadText,
  formatValue,
  rowHeight,
  toCsv,
  toJson,
  toSqlInList,
  toTsv,
  type GridColumn,
} from "./gridData";

export type { GridColumn } from "./gridData";
export interface GridCellSelection {
  row: number;
  column: string;
  value: unknown;
}
export interface GridPage {
  rows: Record<string, unknown>[];
  columns: GridColumn[];
  limit: number;
  offset: number;
  hasMore: boolean;
  executionTimeMs: number;
}

const ROW_NUMBER_WIDTH = 44;
const DEFAULT_WIDTH = 180;
const MIN_WIDTH = 70;

/** Fixed footer and contained grid for paginated data browsing. */
export function VirtualDataTable({
  data,
  isLoading,
  error,
  onRetry,
  pageSize,
  onPageSize,
  onOffset,
  onSort,
  orderBy,
  direction,
  onCopy,
}: {
  data?: GridPage;
  isLoading: boolean;
  error?: string;
  onRetry: () => void;
  pageSize: number;
  onPageSize: (size: number) => void;
  onOffset: (offset: number) => void;
  onSort: (column: string) => void;
  orderBy?: string;
  direction: "asc" | "desc";
  onCopy: (value: string) => void;
}) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {isLoading ? (
        <div
          className="min-h-0 flex-1 space-y-2 overflow-hidden p-3"
          role="status"
          aria-label="Loading rows"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="h-7 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div
          className="m-3 rounded-md border border-danger/30 bg-danger-subtle p-3 text-ui-sm text-danger"
          role="alert"
        >
          <p>{error}</p>
          <Button variant="outline" size="xs" className="mt-2" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : (
        <VirtualDataGrid
          rows={data?.rows ?? []}
          columns={data?.columns ?? []}
          rowOffset={data?.offset ?? 0}
          onSort={onSort}
          orderBy={orderBy}
          direction={direction}
          onCopy={onCopy}
          exportName="table-page"
        />
      )}
      <div className="relative z-30 flex h-8 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-ui-xs text-muted-foreground">
        <span>
          Rows {data?.rows.length ? (data.offset + 1).toLocaleString() : 0}–
          {((data?.offset ?? 0) + (data?.rows.length ?? 0)).toLocaleString()}
        </span>
        <label className="ml-auto flex items-center gap-1">
          Page size
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            className="h-6 rounded border border-border bg-surface px-1 text-ui-xs text-foreground"
          >
            {[50, 100, 200, 500].map((size) => (
              <option value={size} key={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="xs"
          disabled={(data?.offset ?? 0) === 0}
          onClick={() => onOffset(Math.max(0, (data?.offset ?? 0) - pageSize))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={!data?.hasMore}
          onClick={() => onOffset((data?.offset ?? 0) + pageSize)}
        >
          Next
        </Button>
        <span>{data?.executionTimeMs ?? 0} ms</span>
      </div>
    </div>
  );
}

/**
 * Virtualised result grid with pinned and reorderable columns, per-column filters,
 * type-aware cells, column stats on hover, a cell inspector and copy/export actions.
 * Filters and export act on the rows already loaded.
 */
export function VirtualDataGrid({
  rows,
  columns,
  onSort,
  orderBy,
  direction,
  rowOffset = 0,
  onCopy,
  exportName = "results",
}: {
  rows: Record<string, unknown>[];
  columns: GridColumn[];
  onSort: (column: string) => void;
  orderBy?: string;
  direction: "asc" | "desc";
  rowOffset?: number;
  onCopy?: (value: string) => void;
  exportName?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [selection, setSelection] = useState<GridCellSelection | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  const baseColumns = useMemo<GridColumn[]>(
    () =>
      columns.length ? columns : Object.keys(rows[0] ?? {}).map((name) => ({ name, dataType: "" })),
    [columns, rows],
  );
  const byName = useMemo(
    () => new Map(baseColumns.map((column) => [column.name, column])),
    [baseColumns],
  );
  const names = useMemo(() => {
    const known = baseColumns.map((column) => column.name);
    const ordered = [
      ...order.filter((name) => known.includes(name)),
      ...known.filter((name) => !order.includes(name)),
    ];
    return [
      ...ordered.filter((name) => pinned.includes(name)),
      ...ordered.filter((name) => !pinned.includes(name)),
    ];
  }, [baseColumns, order, pinned]);
  const shownColumns = names.map((name) => byName.get(name)!);
  const widthFor = (name: string) => widths[name] ?? DEFAULT_WIDTH;
  const lefts = (() => {
    let x = ROW_NUMBER_WIDTH;
    return shownColumns.map((column) => {
      const left = x;
      x += widthFor(column.name);
      return left;
    });
  })();
  const totalWidth =
    ROW_NUMBER_WIDTH + shownColumns.reduce((sum, column) => sum + widthFor(column.name), 0);
  const gridTemplate = `${ROW_NUMBER_WIDTH}px ${shownColumns.map((column) => `${widthFor(column.name)}px`).join(" ")}`;

  const formatted = useMemo(
    () =>
      rows.map((row) =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [key, formatValue(value)])),
      ),
    [rows],
  );
  const stats = useMemo(
    () =>
      new Map(
        baseColumns.map((column) => {
          let nulls = 0;
          const distinct = new Set<string>();
          for (const row of rows) {
            const value = row[column.name];
            if (value === null || value === undefined) nulls += 1;
            else distinct.add(formatValue(value, 80));
          }
          return [column.name, { nulls, distinct: distinct.size }] as const;
        }),
      ),
    [baseColumns, rows],
  );
  const activeFilters = useMemo(
    () =>
      Object.entries(filters)
        .map(([name, text]) => [name, text.trim().toLowerCase()] as const)
        .filter(([, text]) => text !== ""),
    [filters],
  );
  const visible = useMemo(
    () =>
      rows.flatMap((_, index) =>
        activeFilters.every(([name, text]) =>
          (formatted[index]?.[name] ?? "").toLowerCase().includes(text),
        )
          ? [index]
          : [],
      ),
    [rows, formatted, activeFilters],
  );

  const headerHeight = rowHeight() * (showFilters ? 2 : 1);
  const rowVirtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight(),
    scrollMargin: headerHeight,
    overscan: 10,
  });

  const columnNames = shownColumns.map((column) => column.name);
  const visibleRows = visible.map((index) => rows[index]!);
  const selectedRow = selection ? rows[selection.row] : undefined;
  const copy = (text: string) => onCopy?.(text);
  const move = (name: string, delta: -1 | 1) => {
    const next = [...names];
    const index = next.indexOf(name);
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
  };
  const togglePin = (name: string) =>
    setPinned((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border bg-surface px-2 text-ui-xs text-muted-foreground">
        <span>
          {visible.length.toLocaleString()}
          {activeFilters.length ? ` of ${rows.length.toLocaleString()}` : ""} rows
        </span>
        <span className="flex-1" />
        <Button
          variant={showFilters ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={showFilters}
          onClick={() => setShowFilters((value) => !value)}
        >
          <Filter data-icon="inline-start" />
          Filter
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="xs" aria-label="Copy options">
                <Copy data-icon="inline-start" />
                Copy
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!selection}
              onClick={() => selection && copy(formatValue(selection.value, Infinity))}
            >
              Copy cell
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!selectedRow}
              onClick={() => selectedRow && copy(toJson([selectedRow], columnNames))}
            >
              Copy row as JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => copy(toCsv(visibleRows, columnNames))}>
              Copy visible rows as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => copy(toTsv(visibleRows, columnNames))}>
              Copy visible rows as TSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => copy(toJson(visibleRows, columnNames))}>
              Copy visible rows as JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!selection}
              onClick={() =>
                selection && copy(toSqlInList(visibleRows.map((row) => row[selection.column])))
              }
            >
              Copy column as SQL IN-list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="xs"
          aria-label="Export as CSV"
          onClick={() =>
            downloadText(
              `${exportName}.csv`,
              toCsv(visibleRows, columnNames),
              "text/csv;charset=utf-8",
            )
          }
        >
          <Download data-icon="inline-start" />
          CSV
        </Button>
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          role="grid"
          aria-label="Database rows"
          className="relative min-h-0 min-w-0 flex-1 overflow-auto"
          style={{ contain: "strict" }}
        >
          <div
            className="sticky top-0 z-20 bg-muted"
            style={{ width: totalWidth, minWidth: "100%" }}
          >
            <div
              className="grid text-code"
              style={{ height: rowHeight(), width: totalWidth, gridTemplateColumns: gridTemplate }}
            >
              <div className="sticky left-0 z-30 flex items-center justify-end border-b border-r border-border bg-muted px-2 text-ui-xs text-muted-foreground">
                #
              </div>
              {shownColumns.map((column, index) => (
                <HeaderCell
                  key={column.name}
                  column={column}
                  left={lefts[index] ?? ROW_NUMBER_WIDTH}
                  height={rowHeight()}
                  width={widthFor(column.name)}
                  pinned={pinned.includes(column.name)}
                  stats={stats.get(column.name)}
                  orderBy={orderBy}
                  direction={direction}
                  canMoveLeft={index > 0}
                  canMoveRight={index < shownColumns.length - 1}
                  onSort={() => onSort(column.name)}
                  onPin={() => togglePin(column.name)}
                  onMove={(delta) => move(column.name, delta)}
                  onResize={(next) => setWidths((current) => ({ ...current, [column.name]: next }))}
                />
              ))}
            </div>
            {showFilters && (
              <div
                className="grid border-t border-border bg-surface"
                style={{
                  height: rowHeight(),
                  width: totalWidth,
                  gridTemplateColumns: gridTemplate,
                }}
              >
                <div className="sticky left-0 z-30 border-r border-border bg-surface" />
                {shownColumns.map((column, index) => (
                  <div
                    key={column.name}
                    className={`min-w-0 border-r border-border px-1 ${pinned.includes(column.name) ? "sticky z-20 bg-surface" : ""}`}
                    style={pinned.includes(column.name) ? { left: lefts[index] } : undefined}
                  >
                    <Input
                      aria-label={`Filter ${column.name}`}
                      value={filters[column.name] ?? ""}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, [column.name]: event.target.value }))
                      }
                      placeholder="Contains…"
                      className="h-6 px-1 text-ui-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div
            className="relative"
            style={{ width: totalWidth, minWidth: "100%", height: rowVirtualizer.getTotalSize() }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const source = visible[virtualRow.index]!;
              return (
                <div
                  key={virtualRow.key}
                  role="row"
                  className="absolute left-0 grid text-code hover:bg-muted/70"
                  style={{
                    top: virtualRow.start - headerHeight,
                    height: virtualRow.size,
                    width: totalWidth,
                    gridTemplateColumns: gridTemplate,
                  }}
                >
                  <div className="sticky left-0 z-[1] flex items-center justify-end border-b border-r border-border bg-surface px-2 text-ui-xs text-muted-foreground">
                    {rowOffset + source + 1}
                  </div>
                  {shownColumns.map((column, index) => (
                    <Cell
                      key={column.name}
                      display={formatted[source]?.[column.name] ?? "NULL"}
                      original={rows[source]?.[column.name]}
                      width={widthFor(column.name)}
                      left={lefts[index] ?? ROW_NUMBER_WIDTH}
                      pinned={pinned.includes(column.name)}
                      selected={selection?.row === source && selection.column === column.name}
                      onSelect={() =>
                        setSelection({
                          row: source,
                          column: column.name,
                          value: rows[source]?.[column.name],
                        })
                      }
                    />
                  ))}
                </div>
              );
            })}
            {!rows.length && (
              <div className="p-5 text-center text-ui-sm text-muted-foreground">
                No rows returned.
              </div>
            )}
            {rows.length > 0 && visible.length === 0 && (
              <div className="p-5 text-center text-ui-sm text-muted-foreground">
                No rows match the filters.
              </div>
            )}
          </div>
        </div>
        {selection && (
          <aside
            className="flex w-64 shrink-0 flex-col overflow-hidden border-l border-border bg-surface"
            aria-label="Cell inspector"
          >
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2 text-ui-xs">
              <span className="min-w-0 flex-1 truncate font-medium">{selection.column}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Close cell inspector"
                onClick={() => setSelection(null)}
              >
                <X />
              </Button>
            </div>
            <p className="px-2 pt-1 text-ui-xs text-muted-foreground">
              Row {rowOffset + selection.row + 1} · {cellKind(selection.value)}
            </p>
            <pre
              data-selectable="true"
              className="m-2 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-code"
            >
              {formatValue(selection.value, Infinity)}
            </pre>
            <Button
              variant="outline"
              size="xs"
              className="mx-2 mb-2"
              onClick={() => copy(formatValue(selection.value, Infinity))}
            >
              <Copy data-icon="inline-start" />
              Copy value
            </Button>
          </aside>
        )}
      </div>
    </div>
  );
}

const HeaderCell = memo(function HeaderCell({
  column,
  left,
  height,
  width,
  pinned,
  stats,
  orderBy,
  direction,
  canMoveLeft,
  canMoveRight,
  onSort,
  onPin,
  onMove,
  onResize,
}: {
  column: GridColumn;
  left: number;
  height: number;
  width: number;
  pinned: boolean;
  stats?: { nulls: number; distinct: number };
  orderBy?: string;
  direction: "asc" | "desc";
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onSort: () => void;
  onPin: () => void;
  onMove: (delta: -1 | 1) => void;
  onResize: (width: number) => void;
}) {
  const sorted = orderBy === column.name;
  const title = `${column.name}${column.dataType ? ` · ${column.dataType}` : ""}${stats ? ` · ${stats.nulls.toLocaleString()} null · ${stats.distinct.toLocaleString()} distinct (loaded rows)` : ""}`;
  const startResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.startX = String(event.clientX);
    event.currentTarget.dataset.startWidth = String(width);
  };
  const moveResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const startX = Number(event.currentTarget.dataset.startX);
    const startWidth = Number(event.currentTarget.dataset.startWidth);
    onResize(Math.max(MIN_WIDTH, startWidth + event.clientX - startX));
  };
  return (
    <div
      role="columnheader"
      className={`relative flex min-w-0 items-center border-b border-r border-border bg-muted ${pinned ? "sticky z-20" : ""}`}
      style={{ width, height, left: pinned ? left : undefined }}
      title={title}
    >
      <button
        type="button"
        onClick={onSort}
        className="flex h-full min-w-0 flex-1 items-center gap-1 truncate px-2 text-left font-medium hover:bg-accent-subtle"
      >
        <span className="truncate">{column.name}</span>
        {sorted && (
          <span aria-label={direction === "asc" ? "ascending" : "descending"}>
            {direction === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-xs" aria-label={`Options for ${column.name}`}>
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onPin}>
            {pinned ? <PinOff /> : <Pin />}
            {pinned ? "Unpin column" : "Pin column left"}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveLeft} onClick={() => onMove(-1)}>
            <ArrowLeft />
            Move left
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveRight} onClick={() => onMove(1)}>
            <ArrowRight />
            Move right
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span
        role="separator"
        aria-label={`Resize ${column.name} column`}
        tabIndex={0}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary focus-visible:bg-primary"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onResize(Math.max(MIN_WIDTH, width + (event.key === "ArrowRight" ? 16 : -16)));
          }
        }}
      />
    </div>
  );
});

const Cell = memo(function Cell({
  display,
  original,
  width,
  left,
  pinned,
  selected,
  onSelect,
}: {
  display: string;
  original: unknown;
  width: number;
  left: number;
  pinned: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const kind = cellKind(original);
  const tone =
    kind === "null"
      ? "italic text-muted-foreground"
      : kind === "boolean"
        ? "font-mono text-muted-foreground"
        : kind === "binary"
          ? "font-mono text-muted-foreground"
          : "text-foreground";
  return (
    <div
      role="gridcell"
      className={`flex h-full min-w-0 items-center overflow-hidden border-b border-r border-border px-2 ${pinned ? "sticky z-[1] bg-surface" : ""} ${tone}`}
      style={{ width, left: pinned ? left : undefined }}
    >
      <button
        type="button"
        className={`w-full truncate outline-none focus-visible:ring-2 focus-visible:ring-ring ${kind === "number" ? "text-right tabular-nums" : "text-left"} ${selected ? "bg-accent-subtle" : ""}`}
        title={display}
        onClick={onSelect}
      >
        {display.length > 200 ? `${display.slice(0, 200)}…` : display}
      </button>
    </div>
  );
});
