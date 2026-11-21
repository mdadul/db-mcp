import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import type { ActivityItem } from "../api/activityApi";

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "success" ? "secondary" : status === "error" || status === "timeout" || status === "blocked" ? "destructive" : "outline";
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

export function ActivityTable({ items }: { items: ActivityItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <div className="overflow-hidden rounded-lg border border-border bg-card">
    <Table>
      <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableHead>Time</TableHead><TableHead>Tool</TableHead><TableHead>Database</TableHead><TableHead>Duration</TableHead><TableHead>Rows</TableHead><TableHead>Status</TableHead><TableHead className="w-10"><span className="sr-only">Details</span></TableHead>
      </TableRow></TableHeader>
      <TableBody>{items.map((item) => <Fragment key={item.id}>
        <TableRow>
          <TableCell><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()} className="text-muted-foreground">{formatRelativeTime(item.createdAt)}</time></TableCell>
          <TableCell className="font-mono text-[11px]">{item.tool}</TableCell>
          <TableCell>{item.databaseName ?? <span className="text-muted-foreground">—</span>}</TableCell>
          <TableCell className="font-mono">{item.durationMs === null ? "—" : `${item.durationMs} ms`}</TableCell>
          <TableCell className="font-mono">{item.rows ?? "—"}</TableCell>
          <TableCell><StatusBadge status={item.status} /></TableCell>
          <TableCell>{item.error && <Button variant="ghost" size="icon-xs" aria-label={`${expanded === item.id ? "Hide" : "Show"} error details`} onClick={() => setExpanded((current) => current === item.id ? null : item.id)}>{expanded === item.id ? <ChevronDown /> : <ChevronRight />}</Button>}</TableCell>
        </TableRow>
        {expanded === item.id && item.error && <TableRow><TableCell colSpan={7}><pre className="max-w-full whitespace-pre-wrap rounded-md bg-destructive/5 p-3 font-mono text-xs text-destructive">{item.error}</pre></TableCell></TableRow>}
      </Fragment>)}</TableBody>
    </Table>
  </div>;
}
