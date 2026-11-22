import { useCallback, useState } from "react";
import { readStoredFavourites, tableKey, writeStoredFavourites, type TableRef } from "./model";

/** Favourite tables per connection, persisted to localStorage in the order they were added. */
export function useFavouriteTables(connectionId: string) {
  const [favouritesByConnection, setFavouritesByConnection] = useState<Record<string, string[]>>(readStoredFavourites);
  const keys = favouritesByConnection[connectionId] ?? [];

  const toggle = useCallback((table: TableRef) => {
    const key = tableKey(table);
    const current = favouritesByConnection[connectionId] ?? [];
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    const updated = { ...favouritesByConnection, [connectionId]: next };
    setFavouritesByConnection(updated);
    writeStoredFavourites(updated);
  }, [connectionId, favouritesByConnection]);

  return { favouriteKeys: keys, toggle };
}
