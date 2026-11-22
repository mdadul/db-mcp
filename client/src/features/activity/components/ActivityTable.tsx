import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
import type { ActivityItem } from "../api/activityApi";
import type { ReactNode } from "react";

const ROW_HEIGHT = 36;

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return null;
  const variant = status === "error" || status === "timeout" || status === "blocked" ? "destructive" : "outline";
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

function SourceLabel({ source }: { source: string }) {
  const labels: Record<string, string> = { mcp: "AI client", agent: "Analyst", app: "You" };
  return <span className="text-ui-xs text-muted-foreground">{labels[source] ?? source}</span>;
}

export function ActivityTable({ items }: { items: ActivityItem[] }) {
  const [selected, setSelected] = useState<ActivityItem | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_HEIGHT, overscan: 10 });
  const rows = virtualizer.getVirtualItems();
  const columns = "grid-cols-[minmax(96px,0.8fr)_minmax(80px,0.65fr)_minmax(130px,1.1fr)_minmax(130px,1.2fr)_72px_64px_90px]";

  return <>
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className={`hidden grid ${columns} h-8 items-center gap-2 border-b border-border bg-muted/40 px-3 text-ui-xs font-semibold text-muted-foreground sm:grid`}><span>Time</span><span>Source</span><span>Tool</span><span>Database</span><span>Duration</span><span>Rows</span><span>Status</span></div>
      <div ref={parentRef} className="max-h-[min(60vh,620px)] overflow-auto" role="rowgroup" aria-label="Activity events">
        {items.length > 0 && <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>{rows.map((virtualRow) => {
          const item = items[virtualRow.index];
          return <button key={item.id} type="button" role="row" aria-label={`${item.tool}, ${item.status}, ${formatRelativeTime(item.createdAt)}`} onClick={() => setSelected(item)} className={["absolute left-0 top-0 grid w-full grid-cols-[minmax(75px,0.8fr)_minmax(90px,1fr)_minmax(80px,0.8fr)] items-center gap-2 border-b border-border px-2 text-left text-ui-xs transition-colors hover:bg-muted/60 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[minmax(96px,0.8fr)_minmax(80px,0.65fr)_minmax(130px,1.1fr)_minmax(130px,1.2fr)_72px_64px_90px] sm:gap-2 sm:px-3 sm:text-ui-xs", item.status !== "success" && "bg-danger-subtle/30"].filter(Boolean).join(" ")} style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}>
            <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()} className="truncate text-muted-foreground">{formatRelativeTime(item.createdAt)}</time>
            <span className="hidden sm:inline-flex"><SourceLabel source={item.source} /></span>
            <span className="truncate font-mono" title={item.tool}>{item.tool}</span>
            <span className="hidden truncate sm:inline-block" title={item.databaseName ?? undefined}>{item.databaseName ?? <span className="text-muted-foreground">—</span>}</span>
            <span className="hidden font-mono text-muted-foreground sm:inline-block">{item.durationMs === null ? "" : `${item.durationMs} ms`}</span>
            <span className="hidden font-mono text-muted-foreground sm:inline-block">{item.rows ?? ""}</span>
            <span><StatusBadge status={item.status} /></span>
          </button>;
        })}</div>}
      </div>
      {items.length === 0 && <p className="p-8 text-center text-ui-sm text-muted-foreground">No events match these filters.</p>}
    </div>
    {selected && <div className="fixed inset-0 z-40 flex justify-end bg-black/20" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><aside className="flex h-full w-full max-w-[420px] flex-col border-l border-border bg-popover shadow-xl" role="dialog" aria-modal="true" aria-label="Activity details"><div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4"><div><p className="text-ui font-semibold">Activity details</p><p className="mt-1 text-ui-xs text-muted-foreground">{new Date(selected.createdAt).toLocaleString()}</p></div><Button size="icon-sm" variant="ghost" aria-label="Close details" onClick={() => setSelected(null)}><X /></Button></div><div className="flex-1 space-y-4 overflow-auto p-4"><Detail label="Source"><SourceLabel source={selected.source} /></Detail><Detail label="Tool"><code className="font-mono text-ui-xs">{selected.tool}</code></Detail><Detail label="Database">{selected.databaseName ?? "—"}</Detail><Detail label="Status"><StatusBadge status={selected.status} /></Detail><Detail label="Duration">{selected.durationMs === null ? "—" : `${selected.durationMs} ms`}</Detail><Detail label="Rows returned">{selected.rows ?? "—"}</Detail>{selected.error && <Detail label="Error"><pre className="whitespace-pre-wrap rounded-md border border-danger/30 bg-danger-subtle p-2 font-mono text-ui-xs text-destructive">{selected.error}</pre></Detail>}{selected.hint && <Detail label="Hint"><p className="text-ui-xs text-muted-foreground">{selected.hint}</p></Detail>}{selected.args && <Detail label="Tool arguments"><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-2 font-mono text-ui-xs">{formatArgs(selected.args)}</pre></Detail>}{!selected.error && !selected.hint && !selected.args && <p className="text-ui-xs text-muted-foreground">No additional details were recorded for this event.</p>}</div></aside></div>}
  </>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1"><p className="text-ui-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><div className="text-ui-sm">{children}</div></div>;
}

function formatArgs(value: string): string {
  try { return JSON.stringify(JSON.parse(value) as unknown, null, 2); }
  catch { return value; }
}
