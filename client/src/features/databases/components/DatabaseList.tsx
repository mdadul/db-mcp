import { useEffect, useState, useMemo } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useAtomValue, useSetAtom } from "jotai";
import { Link, useNavigate } from "react-router-dom";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLayout } from "@/components/layout/PageLayout";
import { ConfirmModal } from "@/components/brand/ConfirmModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/Toast";
import {
  Database,
  Plus,
  RefreshCw,
  ShieldCheck,
  Eye,
  EyeOff,
  Terminal,
  Search,
  Play,
  Zap,
  List,
} from "@/components/ui/Icons";

import {
  databasesAtom,
  loadingAtom,
  errorAtom,
  fetchDatabasesAtom,
  deleteDatabaseAtom,
  toggleStatusAtom,
  testConnectionAtom,
} from "../atoms/databaseAtoms";
import { DatabaseTable } from "./DatabaseTable";
import { DatabaseStatsBar } from "./DatabaseStatsBar";
import { McpUsageStats } from "./McpUsageStats";
import { DatabaseToolbar } from "./DatabaseToolbar";
import { BulkActionBar } from "./BulkActionBar";
import { DatabaseDetailModal } from "./DatabaseDetailModal";
import { McpSnippetCard } from "./McpSnippetCard";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { useBulkActions } from "../hooks/useBulkActions";
import type { DatabaseConnection } from "../types";

const STORAGE_KEYS = {
  searchQuery: "dbmcp.searchQuery",
  envFilter: "dbmcp.envFilter",
  statusFilter: "dbmcp.statusFilter",
  showInsights: "dbmcp.showInsights",
};

export function DatabaseList() {
  const navigate = useNavigate();
  const databases = useAtomValue(databasesAtom);
  const loading = useAtomValue(loadingAtom);
  const error = useAtomValue(errorAtom);

  const fetchDatabases = useSetAtom(fetchDatabasesAtom);
  const deleteDatabase = useSetAtom(deleteDatabaseAtom);
  const toggleStatus = useSetAtom(toggleStatusAtom);
  const testConnection = useSetAtom(testConnectionAtom);

  const [searchQuery, setSearchQuery] = useLocalStorage(STORAGE_KEYS.searchQuery, "");
  const [envFilter, setEnvFilter] = useLocalStorage(STORAGE_KEYS.envFilter, "all");
  const [statusFilter, setStatusFilter] = useLocalStorage(STORAGE_KEYS.statusFilter, "all");
  const [showInsights, setShowInsights] = useLocalStorage(STORAGE_KEYS.showInsights, false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DatabaseConnection | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DatabaseConnection | null>(null);

  useEffect(() => { fetchDatabases(); }, [fetchDatabases]);

  const availableEnvironments = useMemo(() => {
    const set = new Set<string>();
    for (const d of databases) if (d.environment) set.add(d.environment);
    return Array.from(set).sort();
  }, [databases]);

  const filteredDatabases = useMemo(() => databases.filter((db) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !db.name.toLowerCase().includes(q) &&
        !db.host.toLowerCase().includes(q) &&
        !db.databaseName.toLowerCase().includes(q) &&
        !(db.serviceName?.toLowerCase().includes(q) ?? false)
      ) return false;
    }
    if (envFilter !== "all" && db.environment !== envFilter) return false;
    if (statusFilter !== "all" && db.status !== statusFilter) return false;
    return true;
  }), [databases, searchQuery, envFilter, statusFilter]);

  const palette = useCommandPalette({
    databases,
    onOpenWorkbench: setDetailTarget,
    onTestConnection: (id) => testConnection(id),
    onRefresh: fetchDatabases,
    onNavigate: navigate,
    showInsights,
    onToggleInsights: () => setShowInsights((prev) => !prev),
  });

  const bulk = useBulkActions({
    databases,
    selectedIds,
    onClearSelection: () => setSelectedIds([]),
    onToggleStatus: toggleStatus,
    onDeleteDatabase: deleteDatabase,
  });

  const handleToggleSelect = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);

  const handleToggleSelectAll = () =>
    setSelectedIds(selectedIds.length === filteredDatabases.length ? [] : filteredDatabases.map((d) => d.id));

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const success = await deleteDatabase({ id: deleteTarget.id, name: deleteTarget.name });
    setIsDeleting(false);
    if (success) {
      toast.add({ type: "success", title: `Deleted connection "${deleteTarget.name}"` });
      setDeleteTarget(null);
    }
  };

  // Enrich palette items with icons (icons are JSX, kept in component layer)
  const paletteItemIcons: Record<string, React.ReactNode> = {
    refresh: <RefreshCw className="h-3.5 w-3.5 text-primary" />,
    add: <Plus className="h-3.5 w-3.5 text-primary" />,
    "table-view": <List className="h-3.5 w-3.5 text-primary" />,
    "toggle-insights": showInsights ? <EyeOff className="h-3.5 w-3.5 text-primary" /> : <Eye className="h-3.5 w-3.5 text-primary" />,
  };
  const paletteItems = palette.items.map((item) => ({
    ...item,
    icon: paletteItemIcons[item.id] ??
      (item.id.startsWith("open-") ? <Play className="h-3.5 w-3.5 text-primary" /> : <Zap className="h-3.5 w-3.5 text-primary" />),
  }));

  if (loading) {
    return (
      <PageLayout maxWidth="6xl">
        <Spinner label="Loading database connections…" />
      </PageLayout>
    );
  }

  return (
    <PageLayout maxWidth="6xl" className="space-y-6">
      <div className="rounded-2xl border border-primary/30 bg-linear-to-r from-muted via-muted to-accent p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              <ShieldCheck className="h-3 w-3" />
              Read-Only · AI-Safe
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Your Databases</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a database, then copy the config snippet for your AI tool.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInsights((prev) => !prev)}
              title="Toggle secondary insights panels"
            >
              {showInsights ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showInsights ? "Hide Insights" : "Show Insights"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => fetchDatabases()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Link to="/new">
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" />
                Add Connection
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Terminal className="h-3.5 w-3.5 text-primary" />
          <span>Keyboard: <span className="font-semibold">Esc</span> close panel, <span className="font-semibold">Ctrl/Cmd+Enter</span> run query, <span className="font-semibold">Up/Down</span> navigate schema tables.</span>
        </div>
      </div>

      <div className="space-y-5">
        {error && <Alert variant="destructive">{error}</Alert>}

        {databases.length > 0 && <DatabaseStatsBar databases={databases} />}

        <McpUsageStats />

        {databases.length > 0 && (
          <div className="sticky top-16 z-20">
            <DatabaseToolbar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              envFilter={envFilter}
              onEnvFilterChange={setEnvFilter}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              environments={availableEnvironments}
            />
          </div>
        )}

        <BulkActionBar
          selectedIds={selectedIds}
          onClearSelection={() => setSelectedIds([])}
          onBulkEnable={bulk.bulkEnable}
          onBulkDisable={bulk.bulkDisable}
          onBulkDelete={bulk.bulkDelete}
          isLoading={bulk.isActioning}
        />

        {databases.length === 0 ? (
          <EmptyState
            icon={<Database className="w-8 h-8" />}
            title="Get started with databases"
            description="Connect your first PostgreSQL or MySQL database to expose it to AI coding agents via MCP. Your database credentials are encrypted with AES-256."
            action={
              <Link to="/new">
                <Button>
                  <span>+</span>
                  <span className="ml-2">Add first database</span>
                </Button>
              </Link>
            }
          />
        ) : filteredDatabases.length === 0 ? (
          <EmptyState
            title="No matching connections found"
            description="Try resetting your search query or filters."
            action={
              <Button
                variant="secondary"
                onClick={() => { setSearchQuery(""); setEnvFilter("all"); setStatusFilter("all"); }}
              >
                Reset Filters
              </Button>
            }
          />
        ) : (
          <DatabaseTable
            databases={filteredDatabases}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onDeleteRequest={setDeleteTarget}
            onOpenDetails={setDetailTarget}
          />
        )}

        {showInsights && <div className="space-y-5"><McpSnippetCard /></div>}
      </div>

      <DatabaseDetailModal
        database={detailTarget}
        isOpen={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete Database Connection"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? AI agents will immediately lose access to this connection.`}
        confirmLabel="Delete Connection"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {palette.open && (
        <div className="fixed inset-0 z-50" onKeyDown={palette.handleKeyDown}>
          <button
            className="absolute inset-0 bg-muted backdrop-blur-[2px]"
            onClick={() => palette.setOpen(false)}
            aria-label="Close command palette"
          />

          <div className="relative mx-auto mt-16 w-[92%] max-w-2xl rounded-2xl border border-primary/30 bg-background shadow-2xl">
            <div className="border-b border-border p-3">
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-2">
                <Search className="h-4 w-4 text-primary" />
                <Input
                  autoFocus
                  value={palette.query}
                  onChange={(e) => { palette.setQuery(e.target.value); palette.setActiveIndex(0); }}
                  placeholder="Search commands or databases..."
                  className="h-8 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                />
                <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-ring">
                  Esc
                </span>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-2">
              {paletteItems.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No matches. Try another database name, host, or command.
                </div>
              ) : (
                paletteItems.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => palette.run(index)}
                    onMouseEnter={() => palette.setActiveIndex(index)}
                    className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                      index === palette.activeIndex ? "bg-primary/10 ring-1 ring-ring" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5">{item.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.hint}</p>
                      </div>
                    </div>
                    {index === palette.activeIndex && (
                      <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-ring">
                        Enter
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              <span>Cmd/Ctrl+K to open command palette</span>
              <span>↑ ↓ to navigate · Enter to run</span>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
