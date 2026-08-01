import { useState } from "react";
import { toast } from "@/components/ui/Toast";
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
    for (const db of selected()) {
      if (db.status !== "enabled") { await onToggleStatus(db); count++; }
    }
    setIsActioning(false);
    toast.add({ type: "success", title: `Enabled ${count} database connection(s)` });
    onClearSelection();
  };

  const bulkDisable = async () => {
    setIsActioning(true);
    let count = 0;
    for (const db of selected()) {
      if (db.status !== "disabled") { await onToggleStatus(db); count++; }
    }
    setIsActioning(false);
    toast.add({ type: "info", title: `Disabled ${count} database connection(s)` });
    onClearSelection();
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} connection(s)? This cannot be undone.`)) return;
    setIsActioning(true);
    let count = 0;
    for (const db of selected()) {
      await onDeleteDatabase({ id: db.id, name: db.name }); count++;
    }
    setIsActioning(false);
    toast.add({ type: "success", title: `Deleted ${count} connection(s)` });
    onClearSelection();
  };

  return { isActioning, bulkEnable, bulkDisable, bulkDelete };
}
