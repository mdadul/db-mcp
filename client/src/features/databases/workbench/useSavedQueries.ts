import { useCallback, useState } from "react";

export const SAVED_QUERIES_KEY = "dbmcp.savedQueries.v1";

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
}

function readSaved(): Record<string, SavedQuery[]> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVED_QUERIES_KEY) ?? "null");
    if (typeof value === "object" && value !== null) return value as Record<string, SavedQuery[]>;
  } catch {
    // Corrupt storage falls back to no saved queries.
  }
  return {};
}

/** Named queries per connection, persisted to localStorage. */
export function useSavedQueries(connectionId: string) {
  const [byConnection, setByConnection] = useState<Record<string, SavedQuery[]>>(readSaved);
  const items = byConnection[connectionId] ?? [];

  const persist = useCallback((next: Record<string, SavedQuery[]>) => {
    setByConnection(next);
    localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(next));
  }, []);

  const save = useCallback(
    (name: string, sql: string) => {
      const entry: SavedQuery = {
        id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        sql,
      };
      persist({ ...byConnection, [connectionId]: [entry, ...items] });
    },
    [byConnection, connectionId, items, persist],
  );

  const remove = useCallback(
    (id: string) => {
      persist({ ...byConnection, [connectionId]: items.filter((item) => item.id !== id) });
    },
    [byConnection, connectionId, items, persist],
  );

  return { items, save, remove };
}
