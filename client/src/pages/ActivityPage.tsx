import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useMcpStats } from "@/features/databases/hooks/useMcpStats";
import { databaseApi } from "@/features/databases/api/databaseApi";
import { getActivity, type ActivitySource, type ActivityStatus } from "@/features/activity/api/activityApi";
import { ActivityTable } from "@/features/activity/components/ActivityTable";

const PAGE_SIZE = 200;
const SOURCE_OPTIONS = [
  { value: "mcp", label: "AI clients" },
  { value: "agent", label: "Analyst" },
  { value: "app", label: "You" },
  { value: "all", label: "All" },
] as const;

export function ActivityPage() {
  const [databaseId, setDatabaseId] = useState("all");
  const [status, setStatus] = useState("all");
  const [tool, setTool] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<(typeof SOURCE_OPTIONS)[number]["value"]>("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [offset, setOffset] = useState(0);
  const stats = useMcpStats();
  const databases = useQuery({ queryKey: ["databases"], queryFn: databaseApi.list });
  const activity = useQuery({
    queryKey: ["activity", { databaseId, status, tool, source, offset }],
    queryFn: () => getActivity({ limit: PAGE_SIZE, offset, ...(databaseId !== "all" ? { databaseId } : {}), ...(status !== "all" ? { status: status as ActivityStatus } : {}), ...(tool.trim() ? { tool: tool.trim() } : {}), ...(source !== "all" ? { source: source as ActivitySource } : {}) }),
    refetchInterval: autoRefresh ? 10_000 : false,
  });
  const queryStats = stats.data?.queries;
  const errors = queryStats?.errors ?? 0;
  const total = queryStats?.total ?? 0;
  const successRate = total ? Math.round(((total - errors) / total) * 100) : 0;
  const errorRate = total ? Math.round((errors / total) * 100) : 0;
  const kpis = [
    { label: "Tool calls", value: stats.data?.totalToolCalls.toLocaleString() ?? "—", detail: "AI usage · last 30 days" },
    { label: "Queries", value: queryStats?.total.toLocaleString() ?? "—", detail: "AI usage · last 30 days" },
    { label: "Avg latency", value: queryStats?.avgMs === null || queryStats?.avgMs === undefined ? "—" : `${queryStats.avgMs} ms`, detail: "Read-only queries" },
    { label: "Error rate", value: queryStats ? `${errorRate}%` : "—", detail: `${queryStats?.errors ?? 0} failed queries` },
    { label: "Rows returned", value: queryStats?.totalRows.toLocaleString() ?? "—", detail: "AI usage · last 30 days" },
  ];
  const visibleItems = (activity.data?.items ?? []).filter((item) => !search.trim() || `${item.tool} ${item.databaseName ?? ""} ${item.status} ${item.source}`.toLowerCase().includes(search.trim().toLowerCase()));

  return <div className="mx-auto w-full max-w-6xl px-6 py-7">
    <PageHeader title="Activity" description="Recent database activity from AI clients, Analyst and you." actions={<label className="flex items-center gap-2 text-[11px] text-muted-foreground"><Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} aria-label="Automatically refresh activity every 10 seconds" />Auto-refresh · 10s</label>} />
    <section aria-label="AI usage statistics for the last 30 days" className="mb-5 overflow-hidden rounded-lg border border-border bg-card"><div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5 lg:divide-x">{kpis.map((kpi) => <div key={kpi.label} className="min-w-0 px-3 py-3"><p className="text-[10px] text-muted-foreground">{kpi.label}</p>{stats.isLoading ? <Skeleton className="mt-2 h-5 w-16" /> : <p className="mt-1 text-[17px] font-semibold tracking-tight">{kpi.value}</p>}<p className="mt-0.5 truncate text-[9px] text-muted-foreground">{kpi.detail}</p></div>)}</div></section>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><SegmentedControl value={source} onChange={(value) => setSource(value)} ariaLabel="Filter activity by source" options={SOURCE_OPTIONS} /><label className="flex items-center gap-2 text-[10px] text-muted-foreground">Auto-refresh updates this list every 10 seconds</label></div>
    <section aria-label="Activity filters" className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-2.5">
      <label className="flex min-w-36 flex-col gap-1 text-[10px] font-medium text-muted-foreground">Database<Select value={databaseId} onValueChange={(value) => setDatabaseId(value ?? "all")}><SelectTrigger className="h-7 w-full" aria-label="Filter by database"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All databases</SelectItem>{(databases.data ?? []).map((db) => <SelectItem key={db.id} value={db.id}>{db.name}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
      <label className="flex min-w-32 flex-col gap-1 text-[10px] font-medium text-muted-foreground">Status<Select value={status} onValueChange={(value) => setStatus(value ?? "all")}><SelectTrigger className="h-7 w-full" aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All statuses</SelectItem>{["success", "error", "timeout", "blocked"].map((item) => <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
      <label className="flex min-w-36 flex-col gap-1 text-[10px] font-medium text-muted-foreground">Tool<Input value={tool} placeholder="Filter by tool" aria-label="Filter by tool name" className="h-7" onChange={(event) => setTool(event.target.value)} /></label>
      <label className="flex min-w-44 flex-1 flex-col gap-1 text-[10px] font-medium text-muted-foreground">Search<Input value={search} placeholder="Tool, database or status" aria-label="Search activity" className="h-7" onChange={(event) => setSearch(event.target.value)} /></label>
      {(databaseId !== "all" || status !== "all" || tool || search || source !== "all") && <Button size="sm" variant="ghost" onClick={() => { setDatabaseId("all"); setStatus("all"); setTool(""); setSearch(""); setSource("all"); setOffset(0); }}>Clear filters</Button>}
    </section>
    {activity.isLoading ? <div className="flex flex-col gap-2 rounded-lg border border-border p-3" role="status" aria-label="Loading activity">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-7 w-full" />)}</div>
      : activity.isError ? <EmptyState title="Activity could not be loaded" description={activity.error instanceof Error ? activity.error.message : "Check that the local server is running, then retry."} action={<Button variant="outline" onClick={() => void activity.refetch()}>Retry</Button>} />
      : visibleItems.length ? <ActivityTable items={visibleItems} />
      : <EmptyState title={source === "all" ? "No activity yet" : `No ${SOURCE_OPTIONS.find((option) => option.value === source)?.label.toLowerCase()} activity`} description={source === "mcp" ? "Tool calls and read-only queries will appear here as your AI clients use db-mcp." : "Try another source or clear your filters."} />}
    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{activity.data ? `${Math.min(offset + visibleItems.length, activity.data.total)} of ${activity.data.total.toLocaleString()} events` : ""}</span><div className="flex items-center gap-2"><span>{autoRefresh ? "Refreshing every 10 seconds" : ""}</span><Button variant="outline" size="xs" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}>Previous</Button><Button variant="outline" size="xs" disabled={!activity.data || offset + PAGE_SIZE >= activity.data.total} onClick={() => setOffset((current) => current + PAGE_SIZE)}>Next</Button></div></div>
  </div>;
}
