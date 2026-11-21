import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Link, useNavigate } from "react-router-dom";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLayout } from "@/components/layout/PageLayout";
import { ConfirmModal } from "@/components/brand/ConfirmModal";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import {
  Database,
} from "@/components/ui/Icons";

import { databaseApi } from "../api/databaseApi";
import type { TestResult } from "../types";
import { DatabaseTable } from "./DatabaseTable";
import { DatabaseToolbar } from "./DatabaseToolbar";
import { BulkActionBar } from "./BulkActionBar";
import { useBulkActions } from "../hooks/useBulkActions";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DatabaseConnection } from "../types";
import { useMcpStats } from "../hooks/useMcpStats";

const STORAGE_KEYS = {
  searchQuery: "dbmcp.searchQuery",
  envFilter: "dbmcp.envFilter",
  statusFilter: "dbmcp.statusFilter",
};

export function DatabaseList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const databasesQuery = useQuery({ queryKey: ["databases"], queryFn: databaseApi.list });
  const databases = databasesQuery.data ?? [];
  const statsQuery = useMcpStats();
  const queryCounts = new Map((statsQuery.data?.byDatabase ?? []).map((item) => [item.databaseConnectionId, item.total]));
  const [sortOrder, setSortOrder] = useState<"name" | "created">("created");
  const toggleStatus = useMutation({
    mutationFn: (db: DatabaseConnection) => databaseApi.toggleStatus(db.id, db.status === "enabled" ? "disabled" : "enabled"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["databases"] }),
  });
  const testConnection = useMutation({ mutationFn: (id: string) => databaseApi.testConnection(id) });
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testedAt, setTestedAt] = useState<Record<string, string>>({});
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
  const [engineFilter, setEngineFilter] = useLocalStorage("dbmcp.engineFilter", "all");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DatabaseConnection | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const isDeleting = deleteDatabase.isPending;

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
    if (engineFilter !== "all" && db.type !== engineFilter) return false;
    return true;
  }).sort((left, right) => sortOrder === "name" ? left.name.localeCompare(right.name) : right.createdAt.localeCompare(left.createdAt)), [databases, searchQuery, envFilter, statusFilter, engineFilter, sortOrder]);

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
    try {
      await deleteDatabase.mutateAsync({ id: deleteTarget.id });
      toast.success(`Deleted connection "${deleteTarget.name}"`);
      setDeleteTarget(null);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not delete connection");
    }
  };

  if (databasesQuery.isLoading) {
    return (
      <PageLayout maxWidth="6xl"><div className="flex flex-col gap-3" role="status" aria-label="Loading database connections"><Skeleton className="h-8 w-56" /><Skeleton className="h-20 w-full" /><Skeleton className="h-72 w-full" /></div></PageLayout>
    );
  }

  return (
    <PageLayout maxWidth="full" className="space-y-3">

      <div className="flex flex-col gap-5">
        {databasesQuery.error && <Alert variant="destructive">{databasesQuery.error instanceof Error ? databasesQuery.error.message : "Failed to load connections"}</Alert>}

        {databases.length > 0 && (
          <div className="sticky top-0 z-20">
            <DatabaseToolbar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              envFilter={envFilter}
              onEnvFilterChange={setEnvFilter}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              environments={availableEnvironments}
              engineFilter={engineFilter}
              onEngineFilterChange={setEngineFilter}
              sortOrder={sortOrder}
              onSortOrderChange={setSortOrder}
            />
          </div>
        )}

        <BulkActionBar
          selectedIds={selectedIds}
          onClearSelection={() => setSelectedIds([])}
          onBulkEnable={bulk.bulkEnable}
          onBulkDisable={bulk.bulkDisable}
        onBulkDelete={() => setBulkDeleteOpen(true)}
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
                onClick={() => { setSearchQuery(""); setEnvFilter("all"); setStatusFilter("all"); setEngineFilter("all"); }}
              >
                Reset Filters
              </Button>
            }
          />
        ) : (
          <DatabaseTable
            databases={filteredDatabases}
            onToggleStatus={(db) => toggleStatus.mutate(db)}
            onTestConnection={(id) => testConnection.mutate(id, { onSuccess: (result) => { setTestResults((current) => ({ ...current, [id]: result })); setTestedAt((current) => ({ ...current, [id]: new Date().toISOString() })); } })}
            testingId={testConnection.isPending ? testConnection.variables : null}
            testResults={testResults}
            testedAt={testedAt}
            queryCounts={queryCounts}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onDeleteRequest={setDeleteTarget}
            onOpenDetails={(db) => navigate(`/connections/${db.id}`)}
          />
        )}

      </div>

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
    <ConfirmModal
      isOpen={bulkDeleteOpen}
      title="Delete selected connections?"
      description={`This permanently deletes ${selectedIds.length} selected connection(s) and their stored activity.`}
      confirmLabel="Delete selected"
      isLoading={bulk.isActioning}
      onConfirm={async () => { await bulk.bulkDelete(); setBulkDeleteOpen(false); }}
      onClose={() => setBulkDeleteOpen(false)}
    />

    </PageLayout>
  );
}
