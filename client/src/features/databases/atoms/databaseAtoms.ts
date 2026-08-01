import { atom } from "jotai";
import { databaseApi } from "../api/databaseApi";
import type { DatabaseConnection, TestResult } from "../types";

// Base State Atoms
export const databasesAtom = atom<DatabaseConnection[]>([]);
export const loadingAtom = atom<boolean>(true);
export const errorAtom = atom<string | null>(null);

export const testingIdAtom = atom<string | null>(null);
export const testResultsAtom = atom<Record<string, TestResult>>({});

// Derived / Action Atoms
export const fetchDatabasesAtom = atom(null, async (_get, set) => {
  set(loadingAtom, true);
  set(errorAtom, null);
  try {
    const dbs = await databaseApi.list();
    set(databasesAtom, dbs);
  } catch (err) {
    set(errorAtom, err instanceof Error ? err.message : "Failed to load databases");
  } finally {
    set(loadingAtom, false);
  }
});

export const deleteDatabaseAtom = atom(
  null,
  async (get, set, payload: { id: string; name: string }) => {
    if (!confirm(`Delete "${payload.name}"? This cannot be undone.`)) return false;
    try {
      await databaseApi.delete(payload.id);
      set(databasesAtom, (prev) => prev.filter((d) => d.id !== payload.id));
      
      // Clean up test result if present
      set(testResultsAtom, (prev) => {
        const next = { ...prev };
        delete next[payload.id];
        return next;
      });
      return true;
    } catch (err) {
      set(errorAtom, err instanceof Error ? err.message : "Failed to delete database");
      return false;
    }
  }
);

export const toggleStatusAtom = atom(
  null,
  async (_get, set, db: DatabaseConnection) => {
    const nextStatus = db.status === "enabled" ? "disabled" : "enabled";
    try {
      const updated = await databaseApi.toggleStatus(db.id, nextStatus);
      set(databasesAtom, (prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d))
      );
    } catch (err) {
      set(errorAtom, err instanceof Error ? err.message : "Failed to update database status");
    }
  }
);

export const testConnectionAtom = atom(null, async (_get, set, id: string) => {
  set(testingIdAtom, id);
  try {
    const result = await databaseApi.testConnection(id);
    set(testResultsAtom, (prev) => ({ ...prev, [id]: result }));
  } catch (err) {
    set(testResultsAtom, (prev) => ({
      ...prev,
      [id]: {
        success: false,
        message: err instanceof Error ? err.message : "Test failed",
      },
    }));
  } finally {
    set(testingIdAtom, null);
  }
});
