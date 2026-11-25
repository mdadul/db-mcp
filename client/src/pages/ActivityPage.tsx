import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import {
  exportActivity,
  getActivity,
  getDailyActivityStats,
  type ActivitySource,
  type ActivityStatus,
} from "@/features/activity/api/activityApi";
import { ActivityTable } from "@/features/activity/components/ActivityTable";
import { databaseApi } from "@/features/databases/api/databaseApi";

const PAGE_SIZE = 200;
type TimeRange = "all" | "24h" | "7d" | "30d";
const RANGE_OPTIONS: { value: TimeRange; label: string; ms: number | null }[] = [
  { value: "all", label: "All time", ms: null },
  { value: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];
/** ISO start of a time range, or undefined for all time. */
function rangeStart(range: TimeRange): string | undefined {
  const option = RANGE_OPTIONS.find((item) => item.value === range);
  return option?.ms ? new Date(Date.now() - option.ms).toISOString() : undefined;
}
const SOURCE_OPTIONS = [
  { value: "mcp", label: "AI clients" },
  { value: "app", label: "You" },
  { value: "all", label: "All" },
] as const;

export function ActivityPage() {
  // Links from a connection ("AI activity") pass databaseId and source in the URL.
  const [searchParams] = useSearchParams();
  const [databaseId, setDatabaseId] = useState(() => searchParams.get("databaseId") ?? "all");
  const [status, setStatus] = useState("all");
  const [tool, setTool] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<(typeof SOURCE_OPTIONS)[number]["value"]>(
    () =>
      SOURCE_OPTIONS.find((option) => option.value === searchParams.get("source"))?.value ?? "all",
  );
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [range, setRange] = useState<TimeRange>("all");
  const [offset, setOffset] = useState(0);
  const dailyStats = useQuery({
    queryKey: ["activity", "daily-stats", source],
    queryFn: () => getDailyActivityStats(source),
  });
  const databases = useQuery({ queryKey: ["databases"], queryFn: databaseApi.list });
  const activity = useQuery({
    queryKey: ["activity", { databaseId, status, tool, source, range, offset }],
    queryFn: () =>
      getActivity({
        limit: PAGE_SIZE,
        offset,
        ...(rangeStart(range) ? { from: rangeStart(range) } : {}),
        ...(databaseId !== "all" ? { databaseId } : {}),
        ...(status !== "all" ? { status: status as ActivityStatus } : {}),
        ...(tool.trim() ? { tool: tool.trim() } : {}),
        ...(source !== "all" ? { source: source as ActivitySource } : {}),
      }),
    refetchInterval: autoRefresh ? 10_000 : false,
  });
  const exportFile = async (format: "csv" | "json") => {
    try {
      const { blob, truncated } = await exportActivity(format, {
        ...(databaseId !== "all" ? { databaseId } : {}),
        ...(status !== "all" ? { status: status as ActivityStatus } : {}),
        ...(tool.trim() ? { tool: tool.trim() } : {}),
        ...(source !== "all" ? { source: source as ActivitySource } : {}),
        ...(rangeStart(range) ? { from: rangeStart(range) } : {}),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `db-mcp-activity.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      if (truncated)
        toast.warning("Export was capped", {
          description:
            "Only the newest 10,000 matching events were exported. Narrow the filters to export the rest.",
        });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export activity");
    }
  };
  const daily = dailyStats.data ?? [];
  const toolCalls = daily.reduce((total, day) => total + day.toolCalls, 0);
  const queries = daily.reduce((total, day) => total + day.queries, 0);
  const errors = daily.reduce((total, day) => total + day.errors, 0);
  const rows = daily.reduce((total, day) => total + day.rows, 0);
  const avgMs =
    queries > 0
      ? Math.round(
          daily.reduce((total, day) => total + (day.avgMs ?? 0) * day.queries, 0) / queries,
        )
      : null;
  const totalEvents = toolCalls + queries;
  const errorRate = totalEvents ? Math.round((errors / totalEvents) * 100) : null;
  const sourceLabel =
    SOURCE_OPTIONS.find((option) => option.value === source)?.label ?? "All sources";
  const activityResultsRef = useRef<HTMLDivElement>(null);
  const focusErrorResultsRef = useRef(false);
  const handleErrorRateClick = () => {
    if (status === "error" && offset === 0) {
      activityResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      activityResultsRef.current?.focus({ preventScroll: true });
      return;
    }
    focusErrorResultsRef.current = true;
    setStatus("error");
    setOffset(0);
  };
  useEffect(() => {
    if (!focusErrorResultsRef.current || status !== "error" || offset !== 0) return;
    focusErrorResultsRef.current = false;
    requestAnimationFrame(() => {
      activityResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      activityResultsRef.current?.focus({ preventScroll: true });
    });
  }, [status, offset]);
  const kpis = [
    {
      label: "Tool calls",
      value: dailyStats.isLoading ? "—" : toolCalls.toLocaleString(),
      detail: `${sourceLabel} · last 30 days`,
      trend: daily.map((day) => day.toolCalls),
    },
    {
      label: "Queries",
      value: dailyStats.isLoading ? "—" : queries.toLocaleString(),
      detail: `${sourceLabel} · last 30 days`,
      trend: daily.map((day) => day.queries),
    },
    {
      label: "Avg query duration",
      value: dailyStats.isLoading || avgMs === null ? "—" : `${avgMs} ms`,
      detail: "Read-only queries · last 30 days",
      trend: daily.map((day) => day.avgMs ?? 0),
    },
    {
      label: "Error rate",
      value: dailyStats.isLoading || errorRate === null ? "—" : `${errorRate}%`,
      detail: `${errors.toLocaleString()} failed events · View errors`,
      trend: daily.map((day) =>
        day.queries + day.toolCalls ? (day.errors / (day.queries + day.toolCalls)) * 100 : 0,
      ),
      action: "errors" as const,
    },
    {
      label: "Rows returned",
      value: dailyStats.isLoading ? "—" : rows.toLocaleString(),
      detail: `${sourceLabel} · last 30 days`,
      trend: daily.map((day) => day.rows),
    },
  ];
  const visibleItems = (activity.data?.items ?? []).filter(
    (item) =>
      !search.trim() ||
      `${item.tool} ${item.databaseName ?? ""} ${item.status} ${item.source}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-7">
      <PageHeader
        title="Activity"
        description="Recent database activity from AI clients and you."
        actions={
          <label className="flex items-center gap-2 text-ui-xs text-muted-foreground">
            <Switch
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              aria-label="Automatically refresh activity every 10 seconds"
            />
            Auto-refresh · 10s
          </label>
        }
      />
      <section
        aria-label={`${sourceLabel} usage statistics for the last 30 days`}
        className="mb-5 overflow-hidden rounded-lg border border-border bg-card"
      >
        <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5 lg:divide-x">
          {kpis.map((kpi) => {
            const content = (
              <>
                <p className="text-ui-xs text-muted-foreground">{kpi.label}</p>
                {dailyStats.isLoading ? (
                  <Skeleton className="mt-2 h-5 w-16" />
                ) : (
                  <p className="mt-1 text-ui-title font-semibold tracking-tight">{kpi.value}</p>
                )}
                <Sparkline
                  values={kpi.trend}
                  label={`${kpi.label} over the last 30 days for ${sourceLabel}`}
                />
                <p className="mt-0.5 truncate text-ui-xs text-muted-foreground">{kpi.detail}</p>
              </>
            );
            return kpi.action === "errors" ? (
              <button
                key={kpi.label}
                type="button"
                aria-label={`View errors. Error rate ${kpi.value}`}
                onClick={handleErrorRateClick}
                className="min-w-0 px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {content}
              </button>
            ) : (
              <div key={kpi.label} className="min-w-0 px-3 py-3">
                {content}
              </div>
            );
          })}
        </div>
      </section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          value={source}
          onChange={(value) => setSource(value)}
          ariaLabel="Filter activity by source"
          options={SOURCE_OPTIONS}
        />
      </div>
      <section
        aria-label="Activity filters"
        className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-2.5"
      >
        <label className="flex min-w-36 flex-col gap-1 text-ui-xs font-medium text-muted-foreground">
          Database
          <Select value={databaseId} onValueChange={(value) => setDatabaseId(value ?? "all")}>
            <SelectTrigger className="h-7 w-full" aria-label="Filter by database">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All databases</SelectItem>
                {(databases.data ?? []).map((db) => (
                  <SelectItem key={db.id} value={db.id}>
                    {db.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-36 flex-col gap-1 text-ui-xs font-medium text-muted-foreground">
          Time range
          <Select value={range} onValueChange={(value) => setRange((value ?? "all") as TimeRange)}>
            <SelectTrigger className="h-7 w-full" aria-label="Filter by time range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-32 flex-col gap-1 text-ui-xs font-medium text-muted-foreground">
          Status
          <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}>
            <SelectTrigger className="h-7 w-full" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All statuses</SelectItem>
                {["success", "error", "timeout", "blocked"].map((item) => (
                  <SelectItem key={item} value={item} className="capitalize">
                    {item}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-36 flex-col gap-1 text-ui-xs font-medium text-muted-foreground">
          Tool
          <Input
            value={tool}
            placeholder="Filter by tool"
            aria-label="Filter by tool name"
            className="h-7"
            onChange={(event) => setTool(event.target.value)}
          />
        </label>
        <label className="flex min-w-44 flex-1 flex-col gap-1 text-ui-xs font-medium text-muted-foreground">
          Search
          <Input
            value={search}
            placeholder="Tool, database or status"
            aria-label="Search activity"
            className="h-7"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="flex items-end gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label="Export activity as CSV"
            title="Exports the filters above. The search box only filters the loaded page."
            onClick={() => void exportFile("csv")}
          >
            <Download data-icon="inline-start" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Export activity as JSON"
            title="Exports the filters above. The search box only filters the loaded page."
            onClick={() => void exportFile("json")}
          >
            <Download data-icon="inline-start" />
            JSON
          </Button>
        </div>
        {(databaseId !== "all" || status !== "all" || tool || search || source !== "all") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDatabaseId("all");
              setStatus("all");
              setTool("");
              setSearch("");
              setSource("all");
              setOffset(0);
            }}
          >
            Clear filters
          </Button>
        )}
      </section>
      <div
        ref={activityResultsRef}
        tabIndex={-1}
        aria-label="Activity results"
        className="focus-visible:outline-2 focus-visible:outline-ring"
      >
        {activity.isLoading ? (
          <div
            className="flex flex-col gap-2 rounded-lg border border-border p-3"
            role="status"
            aria-label="Loading activity"
          >
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-7 w-full" />
            ))}
          </div>
        ) : activity.isError ? (
          <EmptyState
            title="Activity could not be loaded"
            description={
              activity.error instanceof Error
                ? activity.error.message
                : "Check that the local server is running, then retry."
            }
            action={
              <Button variant="outline" onClick={() => void activity.refetch()}>
                Retry
              </Button>
            }
          />
        ) : visibleItems.length ? (
          <ActivityTable items={visibleItems} />
        ) : (
          <EmptyState
            title={
              source === "all"
                ? "No activity yet"
                : `No ${SOURCE_OPTIONS.find((option) => option.value === source)?.label.toLowerCase()} activity`
            }
            description={
              source === "mcp"
                ? "Tool calls and read-only queries will appear here as your AI clients use db-mcp."
                : "Try another source or clear your filters."
            }
          />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-ui-xs text-muted-foreground">
        <span>
          {activity.data
            ? `${Math.min(offset + visibleItems.length, activity.data.total)} of ${activity.data.total.toLocaleString()} events`
            : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            disabled={offset === 0}
            onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={!activity.data || offset + PAGE_SIZE >= activity.data.total}
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 112;
  const height = 22;
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = values.length < 2 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / max) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      className="mt-1 h-[22px] w-full max-w-28 overflow-visible text-primary"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {values.length > 1 ? (
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <line
          x1="0"
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
