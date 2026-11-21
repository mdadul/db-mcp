import { memo, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface GridColumn { name: string; dataType: string; }
export interface GridCellSelection { row: number; column: string; value: unknown; }
export interface GridPage {
  rows: Record<string, unknown>[];
  columns: GridColumn[];
  limit: number;
  offset: number;
  hasMore: boolean;
  executionTimeMs: number;
}

/** Fixed footer and contained grid for paginated data browsing. */
export function VirtualDataTable({ data, isLoading, error, onRetry, pageSize, onPageSize, onOffset, onSort, orderBy, direction, onCopy }: {
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
  return <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    {isLoading ? <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-3" role="status" aria-label="Loading rows">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-7 animate-pulse rounded bg-muted" />)}</div>
      : error ? <div className="m-3 rounded-md border border-danger/30 bg-danger-subtle p-3 text-secondary text-danger" role="alert"><p>{error}</p><Button variant="outline" size="xs" className="mt-2" onClick={onRetry}>Retry</Button></div>
        : <VirtualDataGrid rows={data?.rows ?? []} columns={data?.columns ?? []} rowOffset={data?.offset ?? 0} onSort={onSort} orderBy={orderBy} direction={direction} onCopy={onCopy} />}
    <div className="relative z-30 flex h-8 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-caption text-muted-foreground">
      <span>Rows {data?.rows.length ? (data.offset + 1).toLocaleString() : 0}–{((data?.offset ?? 0) + (data?.rows.length ?? 0)).toLocaleString()}</span>
      <label className="ml-auto flex items-center gap-1">Page size<select aria-label="Rows per page" value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} className="h-6 rounded border border-border bg-surface px-1 text-caption text-foreground">{[50, 100, 200, 500].map((size) => <option value={size} key={size}>{size}</option>)}</select></label>
      <Button variant="outline" size="xs" disabled={(data?.offset ?? 0) === 0} onClick={() => onOffset(Math.max(0, (data?.offset ?? 0) - pageSize))}>Previous</Button>
      <Button variant="outline" size="xs" disabled={!data?.hasMore} onClick={() => onOffset((data?.offset ?? 0) + pageSize)}>Next</Button>
      <span>{data?.executionTimeMs ?? 0} ms</span>
    </div>
  </div>;
}

/** Contained virtualized result grid. The scroll viewport is the positioning context for its spacer and rows. */
export function VirtualDataGrid({ rows, columns, onSort, orderBy, direction, rowOffset = 0, onCopy }: {
  rows: Record<string, unknown>[];
  columns: GridColumn[];
  onSort: (column: string) => void;
  orderBy?: string;
  direction: "asc" | "desc";
  rowOffset?: number;
  onCopy?: (value: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [selection, setSelection] = useState<GridCellSelection | null>(null);
  const formattedRows = useMemo(() => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, formatValue(value)]))), [rows]);
  const usableColumns = columns.length ? columns : Object.keys(rows[0] ?? {}).map((name) => ({ name, dataType: "" }));
  const widthFor = (column: GridColumn) => widths[column.name] ?? 180;
  const gridTemplate = `${44}px ${usableColumns.map((column) => `${widthFor(column)}px`).join(" ")}`;
  const totalWidth = 44 + usableColumns.reduce((sum, column) => sum + widthFor(column), 0);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight(),
    scrollMargin: rowHeight(),
    overscan: 10,
  });
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: usableColumns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => widthFor(usableColumns[index]!),
    overscan: 4,
  });
  const virtualColumns = usableColumns.length > 30 ? columnVirtualizer.getVirtualItems().map((item) => ({ column: usableColumns[item.index]!, start: item.start, size: item.size })) : usableColumns.map((column, index) => ({ column, start: usableColumns.slice(0, index).reduce((sum, previous) => sum + widthFor(previous), 0), size: widthFor(column) }));
  const columnStart = (index: number) => usableColumns.slice(0, index).reduce((sum, column) => sum + widthFor(column), 44);

  return <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
    <div ref={scrollRef} role="grid" aria-label="Database rows" className="relative min-h-0 min-w-0 flex-1 overflow-auto" style={{ position: "relative", contain: "strict" }}>
      <div className="sticky top-0 z-20 grid bg-muted text-code" style={{ height: rowHeight(), width: totalWidth, minWidth: "100%", gridTemplateColumns: gridTemplate }}>
        <div className="sticky left-0 z-30 flex items-center justify-end border-b border-r border-border bg-muted px-2 text-caption text-muted-foreground">#</div>
        {virtualColumns.map(({ column, start, size }) => {
          const index = usableColumns.indexOf(column);
          return <div key={column.name} className="relative flex min-w-0 items-center border-b border-r border-border" style={{ position: usableColumns.length > 30 ? "absolute" : undefined, left: usableColumns.length > 30 ? columnStart(index) : undefined, width: size, height: rowHeight() }}>
            <button type="button" onClick={() => onSort(column.name)} className="flex h-full min-w-0 flex-1 items-center gap-1 truncate px-2 text-left font-medium hover:bg-accent-subtle" title={`${column.name}${column.dataType ? ` · ${column.dataType}` : ""}`}>
              <span className="truncate">{column.name}</span>{orderBy === column.name && <span aria-label={direction === "asc" ? "ascending" : "descending"}>{direction === "asc" ? "↑" : "↓"}</span>}
            </button>
            <span role="separator" aria-label={`Resize ${column.name} column`} tabIndex={0} className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary focus-visible:bg-primary" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.startX = String(event.clientX); event.currentTarget.dataset.startWidth = String(widthFor(column)); }} onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const startX = Number(event.currentTarget.dataset.startX); const startWidth = Number(event.currentTarget.dataset.startWidth); setWidths((current) => ({ ...current, [column.name]: Math.max(70, startWidth + event.clientX - startX) })); }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setWidths((current) => ({ ...current, [column.name]: Math.max(70, widthFor(column) + (event.key === "ArrowRight" ? 16 : -16)) })); } }} />
          </div>;
        })}
      </div>
      <div className="relative" style={{ width: totalWidth, minWidth: "100%", height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => <div key={virtualRow.key} role="row" className="absolute left-0 grid text-code hover:bg-muted/70" style={{ top: 0, height: virtualRow.size, transform: `translateY(${virtualRow.start - rowHeight()}px)`, width: totalWidth, gridTemplateColumns: gridTemplate }}>
          <div className="sticky left-0 z-[1] flex items-center justify-end border-b border-r border-border bg-surface px-2 text-caption text-muted-foreground">{rowOffset + virtualRow.index + 1}</div>
          {virtualColumns.map(({ column, start, size }) => {
            const index = usableColumns.indexOf(column);
            const display = formattedRows[virtualRow.index]?.[column.name] ?? "NULL";
            const original = rows[virtualRow.index]?.[column.name];
            const selected = selection?.row === virtualRow.index && selection.column === column.name;
            return <Cell key={column.name} column={column} display={display} original={original} size={size} left={columnStart(index)} absolute={usableColumns.length > 30} selected={selected} onSelect={() => setSelection({ row: virtualRow.index, column: column.name, value: original })} />;
          })}
        </div>)}
        {!rows.length && <div className="p-5 text-center text-secondary text-muted-foreground">No rows returned.</div>}
      </div>
    </div>
    {selection && <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-l border-border bg-surface" aria-label="Cell inspector">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2 text-caption"><span className="min-w-0 flex-1 truncate font-medium">{selection.column}</span><Button variant="ghost" size="icon-xs" aria-label="Close cell inspector" onClick={() => setSelection(null)}><X /></Button></div>
      <p className="px-2 pt-1 text-caption text-muted-foreground">Row {rowOffset + selection.row + 1} · {selection.value === null ? "NULL" : typeof selection.value}</p>
       <pre data-selectable="true" className="m-2 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-code">{formatValue(selection.value, Infinity)}</pre>
      <Button variant="outline" size="xs" className="mx-2 mb-2" onClick={() => onCopy?.(formatValue(selection.value, Infinity))}><Copy data-icon="inline-start" />Copy value</Button>
    </aside>}
  </div>;
}

const Cell = memo(function Cell({ column, display, original, size, left, absolute, selected, onSelect }: { column: GridColumn; display: string; original: unknown; size: number; left: number; absolute: boolean; selected: boolean; onSelect: () => void }) {
  const isNull = original === null || original === undefined;
  return <div role="gridcell" style={{ width: size, ...(absolute ? { position: "absolute", left } : {}) }} className={`flex h-full min-w-0 items-center overflow-hidden border-b border-r border-border px-2 ${isNull ? "text-muted-foreground italic" : "text-foreground"}`}>
    <button type="button" className={`w-full truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-accent-subtle" : ""}`} title={display} onClick={onSelect}>{display.length > 200 ? `${display.slice(0, 200)}…` : display}</button>
  </div>;
});

function formatValue(value: unknown, maxLength = 200): string {
  if (value === null || value === undefined) return "NULL";
  let text: string;
  if (typeof value === "string") text = value;
  else { try { text = JSON.stringify(value, null, 2) ?? String(value); } catch { text = String(value); } }
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function rowHeight(): number {
  const parsed = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-h"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 28;
}
