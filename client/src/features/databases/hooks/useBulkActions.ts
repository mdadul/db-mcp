import { useState } from "react";
import { toast } from "sonner";
import type { DatabaseConnection } from "../types";

interface UseBulkActionsOptions {
  databases: DatabaseConnection[];
  selectedIds: string[];
  onClearSelection: () => void;
  onToggleStatus: (db: DatabaseConnection) => Promise<unknown>;
  onDeleteDatabase: (payload: { id: string; name: string }) => Promise<unknown>;
}

export function useBulkActions({
  databases,
  selectedIds,
  onClearSelection,
  onToggleStatus,
  onDeleteDatabase,
}: UseBulkActionsOptions) {
  const [isActioning, setIsActioning] = useState(false);

  const selected = () => selectedIds.map((id) => databases.find((d) => d.id === id)).filter(Boolean) as DatabaseConnection[];

  const bulkEnable = async () => {
    setIsActioning(true);
    let count = 0;
    try {
      for (const db of selected()) {
        if (db.status !== "enabled") { await onToggleStatus(db); count++; }
      }
      toast.success(`Enabled ${count} database connection(s)`);
      onClearSelection();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not enable selected connections");
    } finally {
      setIsActioning(false);
    }
  };

  const bulkDisable = async () => {
    setIsActioning(true);
    let count = 0;
    try {
      for (const db of selected()) {
        if (db.status !== "disabled") { await onToggleStatus(db); count++; }
      }
      toast.info(`Disabled ${count} database connection(s)`);
      onClearSelection();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not disable selected connections");
    } finally {
      setIsActioning(false);
    }
  };

  const bulkDelete = async () => {
    setIsActioning(true);
    let count = 0;
    try {
      for (const db of selected()) {
        await onDeleteDatabase({ id: db.id, name: db.name }); count++;
      }
      toast.success(`Deleted ${count} connection(s)`);
      onClearSelection();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not delete selected connections");
    } finally {
      setIsActioning(false);
    }
  };

  return { isActioning, bulkEnable, bulkDisable, bulkDelete };
}
