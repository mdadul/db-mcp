import { useEffect, useState, useMemo } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useAtomValue, useSetAtom } from "jotai";
import { Link, useNavigate } from "react-router-dom";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLayout } from "@/components/layout/PageLayout";
import { ConfirmModal } from "@/components/brand/ConfirmModal";
import { Button, buttonVariants } from "@/components/ui/Button";
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

  // Full-page spinner only on first load; refreshes keep the current content visible.
  if (loading && databases.length === 0) {
    return (
      <PageLayout maxWidth="6xl">
        <Spinner label="Loading database connections…" />
      </PageLayout>
    );
  }

  return (
    <PageLayout maxWidth="6xl" className="space-y-6">
      {/* Dashboard Hero Banner */}
      <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-6 sm:p-7 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between pb-6 border-b border-[#EEEEEE]">
          <div>
            <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#22C55E]/20 bg-[#22C55E]/10 px-2.5 py-0.5 text-xs text-[#15803D]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
              <span>Read-Only · AI Guardrail Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-[#0A0A0A]">Database Connections</h1>
            <p className="mt-1 text-sm text-[#4D4D4D]">
              Configure connections and expose verified read-only endpoints to your AI coding agents.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInsights((prev) => !prev)}
              title="Toggle secondary insights panels"
              className="text-[#4D4D4D] hover:text-[#0A0A0A]"
            >
              {showInsights ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showInsights ? "Hide Insights" : "Show Insights"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchDatabases()} className="text-[#4D4D4D] hover:text-[#0A0A0A]">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Link to="/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="h-3.5 w-3.5" />
              Add Connection
            </Link>
          </div>
        </div>

        {/* Keyboard hint strip */}
        <div className="pt-3 flex items-center justify-between text-xs text-[#737373]">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-[#4D4D4D] shrink-0" />
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-[#F8F8F8] border border-[#EEEEEE] font-mono text-[10px]">Cmd+K</kbd> palette ·{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-[#F8F8F8] border border-[#EEEEEE] font-mono text-[10px]">Esc</kbd> close
            </span>
          </div>
          <span className="hidden sm:inline text-xs text-[#999999]">Port {window.location.port || "80"} · Streamable HTTP</span>
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
              <Link to="/new" className={buttonVariants()}>
                <Plus className="h-3.5 w-3.5" />
                Add first database
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
        <div className="fixed inset-0 z-50" onKeyDown={palette.handleKeyDown} role="dialog" aria-modal="true" aria-label="Command palette">
          <button
            className="absolute inset-0 bg-[#0A0A0A]/20 backdrop-blur-xs"
            onClick={() => palette.setOpen(false)}
            aria-label="Close command palette"
          />

          <div className="relative mx-auto mt-20 w-[92%] max-w-2xl rounded-[14px] border border-[#EEEEEE] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.08)] overflow-hidden">
            <div className="border-b border-[#EEEEEE] p-3.5">
              <div className="flex items-center gap-2.5 rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] px-3 py-2">
                <Search className="h-4 w-4 text-[#737373]" />
                <Input
                  autoFocus
                  value={palette.query}
                  onChange={(e) => { palette.setQuery(e.target.value); palette.setActiveIndex(0); }}
                  placeholder="Search commands or databases..."
                  className="h-7 border-0 bg-transparent p-0 text-sm text-[#0A0A0A] focus-visible:ring-0 placeholder:text-[#999999]"
                />
                <span className="rounded-[6px] bg-white px-2 py-0.5 text-[10px] font-mono text-[#737373] border border-[#EEEEEE]">
                  Esc
                </span>
              </div>
            </div>

            <div className="max-h-[380px] overflow-y-auto p-2" role="listbox" aria-label="Commands and databases">
              {paletteItems.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#737373]">
                  No matches found.
                </div>
              ) : (
                paletteItems.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => palette.run(index)}
                    onMouseEnter={() => palette.setActiveIndex(index)}
                    role="option"
                    aria-selected={index === palette.activeIndex}
                    className={`mb-1 flex w-full items-center justify-between rounded-[8px] px-3 py-2.5 text-left transition-colors cursor-pointer ${
                      index === palette.activeIndex ? "bg-[#E5E5E5] text-[#0A0A0A]" : "hover:bg-[#F8F8F8] text-[#4D4D4D]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-[#4D4D4D]">{item.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-[#0A0A0A]">{item.label}</p>
                        <p className="text-xs text-[#737373]">{item.hint}</p>
                      </div>
                    </div>
                    {index === palette.activeIndex && (
                      <span className="rounded-[6px] bg-white px-2 py-0.5 text-[10px] font-mono text-[#0A0A0A] border border-[#CCCCCC]">
                        ↵
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#EEEEEE] px-4 py-2.5 text-xs text-[#737373] bg-[#FAFAFA]">
              <span>Cmd+K to open</span>
              <span>↑ ↓ to navigate · Enter to select</span>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
