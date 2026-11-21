import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { useMcpStats } from "@/features/databases/hooks/useMcpStats";
import { databaseApi } from "@/features/databases/api/databaseApi";
import { getActivity, type ActivityStatus } from "@/features/activity/api/activityApi";
import { ActivityTable } from "@/features/activity/components/ActivityTable";

const PAGE_SIZE = 50;

export function ActivityPage() {
  const [databaseId, setDatabaseId] = useState("all");
  const [status, setStatus] = useState("all");
  const [tool, setTool] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [page, setPage] = useState(0);
  const stats = useMcpStats();
  const databases = useQuery({ queryKey: ["databases"], queryFn: databaseApi.list });
  const activity = useQuery({
    queryKey: ["activity", { databaseId, status, tool, page }],
    queryFn: () => getActivity({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, ...(databaseId !== "all" ? { databaseId } : {}), ...(status !== "all" ? { status: status as ActivityStatus } : {}), ...(tool.trim() ? { tool: tool.trim() } : {}) }),
    refetchInterval: autoRefresh ? 10_000 : false,
  });
  const queryStats = stats.data?.queries;
  const successRate = queryStats && queryStats.total > 0 ? Math.round((queryStats.success / queryStats.total) * 100) : 0;
  const kpis = [
    { label: "Queries · 30 days", value: queryStats?.total.toLocaleString() ?? "—", detail: "Read-only query executions" },
    { label: "Success rate", value: queryStats ? `${successRate}%` : "—", detail: `${queryStats?.errors ?? 0} failed queries` },
    { label: "Average duration", value: queryStats?.avgMs === null || queryStats?.avgMs === undefined ? "—" : `${queryStats.avgMs} ms`, detail: "Across logged queries" },
    { label: "Rows returned", value: queryStats?.totalRows.toLocaleString() ?? "—", detail: "Last 30 days" },
  ];

  return <div className="mx-auto w-full max-w-6xl px-6 py-7">
    <PageHeader title="Activity" description="Recent MCP tool calls and database queries on this computer." actions={<label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} aria-label="Automatically refresh activity every 10 seconds" />Auto-refresh · 10s</label>} />
    <section aria-label="Query metrics" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map((kpi) => <div key={kpi.label} className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{kpi.label}</p>{stats.isLoading ? <Skeleton className="mt-3 h-7 w-24" /> : <p className="mt-2 text-2xl font-semibold tracking-tight">{kpi.value}</p>}<p className="mt-1 text-[11px] text-muted-foreground">{kpi.detail}</p></div>)}</section>
    <section aria-label="Activity filters" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
      <label className="flex min-w-44 flex-col gap-1 text-[11px] font-medium text-muted-foreground">Database<Select value={databaseId} onValueChange={(value) => { setDatabaseId(value ?? "all"); setPage(0); }}><SelectTrigger className="h-8 w-full" aria-label="Filter by database"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All databases</SelectItem>{(databases.data ?? []).map((db) => <SelectItem key={db.id} value={db.id}>{db.name}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
      <label className="flex min-w-36 flex-col gap-1 text-[11px] font-medium text-muted-foreground">Status<Select value={status} onValueChange={(value) => { setStatus(value ?? "all"); setPage(0); }}><SelectTrigger className="h-8 w-full" aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All statuses</SelectItem>{["success", "error", "timeout", "blocked"].map((item) => <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
      <label className="flex min-w-48 flex-col gap-1 text-[11px] font-medium text-muted-foreground">Tool<Input value={tool} placeholder="Search tool names" aria-label="Filter by tool name" className="h-8" onChange={(event) => { setTool(event.target.value); setPage(0); }} /></label>
      {(databaseId !== "all" || status !== "all" || tool) && <Button size="sm" variant="ghost" onClick={() => { setDatabaseId("all"); setStatus("all"); setTool(""); setPage(0); }}>Clear filters</Button>}
    </section>
    {activity.isLoading ? <div className="flex flex-col gap-2 rounded-lg border border-border p-4" role="status" aria-label="Loading activity">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}</div>
      : activity.isError ? <EmptyState title="Activity could not be loaded" description={activity.error instanceof Error ? activity.error.message : "Check that the local server is running, then retry."} action={<Button variant="outline" onClick={() => void activity.refetch()}>Retry</Button>} />
      : activity.data?.items.length ? <ActivityTable items={activity.data.items} />
      : <EmptyState title="No activity yet" description="Tool calls and read-only queries will appear here as your AI clients use db-mcp." />}
    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{activity.data ? `${activity.data.total.toLocaleString()} events` : ""}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button><span>Page {page + 1}</span><Button variant="outline" size="sm" disabled={!activity.data || (page + 1) * PAGE_SIZE >= activity.data.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
  </div>;
}
