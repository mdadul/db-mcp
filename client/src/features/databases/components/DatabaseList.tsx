import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Link, useNavigate } from "react-router-dom";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLayout } from "@/components/layout/PageLayout";
import { ConfirmModal } from "@/components/brand/ConfirmModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Database,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
} from "@/components/ui/Icons";

import { databaseApi } from "../api/databaseApi";
import type { TestResult } from "../types";
import { DatabaseTable } from "./DatabaseTable";
import { DatabaseStatsBar } from "./DatabaseStatsBar";
import { McpUsageStats } from "./McpUsageStats";
import { DatabaseToolbar } from "./DatabaseToolbar";
import { BulkActionBar } from "./BulkActionBar";
import { DatabaseDetailModal } from "./DatabaseDetailModal";
import { McpSnippetCard } from "./McpSnippetCard";
import { useBulkActions } from "../hooks/useBulkActions";
import { PageHeader } from "@/components/ui/primitives";
import type { DatabaseConnection } from "../types";

const STORAGE_KEYS = {
  searchQuery: "dbmcp.searchQuery",
  envFilter: "dbmcp.envFilter",
  statusFilter: "dbmcp.statusFilter",
  showInsights: "dbmcp.showInsights",
};

export function DatabaseList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const databasesQuery = useQuery({ queryKey: ["databases"], queryFn: databaseApi.list });
  const databases = databasesQuery.data ?? [];
  const toggleStatus = useMutation({
    mutationFn: (db: DatabaseConnection) => databaseApi.toggleStatus(db.id, db.status === "enabled" ? "disabled" : "enabled"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["databases"] }),
  });
  const testConnection = useMutation({ mutationFn: (id: string) => databaseApi.testConnection(id) });
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const deleteDatabase = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      await databaseApi.delete(id);
      return true;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["databases"] }),
  });

  const [searchQuery, setSearchQuery] = useLocalStorage(STORAGE_KEYS.searchQuery, "");
  const [envFilter, setEnvFilter] = useLocalStorage(STORAGE_KEYS.envFilter, "all");
  const [statusFilter, setStatusFilter] = useLocalStorage(STORAGE_KEYS.statusFilter, "all");
  const [showInsights, setShowInsights] = useLocalStorage(STORAGE_KEYS.showInsights, false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DatabaseConnection | null>(null);
  const isDeleting = deleteDatabase.isPending;
  const [detailTarget, setDetailTarget] = useState<DatabaseConnection | null>(null);

  const fetchDatabases = () => queryClient.invalidateQueries({ queryKey: ["databases"] });

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

  const bulk = useBulkActions({
    databases,
    selectedIds,
    onClearSelection: () => setSelectedIds([]),
    onToggleStatus: async (db) => toggleStatus.mutateAsync(db),
    onDeleteDatabase: async ({ id }) => deleteDatabase.mutateAsync({ id }),
  });

  const handleToggleSelect = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);

  const handleToggleSelectAll = () =>
    setSelectedIds(selectedIds.length === filteredDatabases.length ? [] : filteredDatabases.map((d) => d.id));

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (!confirm(`Delete "${deleteTarget.name}"? This cannot be undone.`)) return;
    const success = await deleteDatabase.mutateAsync({ id: deleteTarget.id });
    if (success) {
      toast.success(`Deleted connection "${deleteTarget.name}"`);
      setDeleteTarget(null);
    }
  };

  if (databasesQuery.isLoading) {
    return (
      <PageLayout maxWidth="6xl">
        <Spinner label="Loading database connections…" />
      </PageLayout>
    );
  }

  return (
    <PageLayout maxWidth="6xl" className="space-y-6">
      <PageHeader
        title="Connections"
        description="Manage the databases available to your AI clients. Credentials are encrypted locally."
        actions={<>
          <Button variant="ghost" size="sm" onClick={() => setShowInsights((prev) => !prev)} title="Toggle usage and MCP snippets">
            {showInsights ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}{showInsights ? "Hide insights" : "Insights"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fetchDatabases()}><RefreshCw data-icon="inline-start" />Refresh</Button>
          <Link to="/connections/new"><Button size="sm"><Plus data-icon="inline-start" />New connection</Button></Link>
        </>}
      />

      <div className="space-y-5">
        {databasesQuery.error && <Alert variant="destructive">{databasesQuery.error instanceof Error ? databasesQuery.error.message : "Failed to load connections"}</Alert>}

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
              <Link to="/connections/new">
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
            onToggleStatus={(db) => toggleStatus.mutate(db)}
            onTestConnection={(id) => testConnection.mutate(id, { onSuccess: (result) => setTestResults((current) => ({ ...current, [id]: result })) })}
            testingId={testConnection.isPending ? testConnection.variables : null}
            testResults={testResults}
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

    </PageLayout>
  );
}
