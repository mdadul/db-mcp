import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { databaseApi } from "../api/databaseApi";
import type { TabKind, TableRef } from "./model";

/** Paging and sorting for the open table, plus its structure and row queries. */
export function useTableBrowser(
  selectedId: string,
  selectedTable: TableRef | null,
  activeKind: TabKind | undefined,
) {
  const [pageSize, setPageSize] = useState(100);
  const [offset, setOffset] = useState(0);
  const [orderBy, setOrderBy] = useState<string>();
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const structureQuery = useQuery({
    queryKey: ["table-structure", selectedId, selectedTable?.schema, selectedTable?.name],
    queryFn: () =>
      databaseApi.getTableStructure(selectedId, selectedTable?.name ?? "", selectedTable?.schema),
    enabled: Boolean(
      selectedId && selectedTable && (activeKind === "structure" || activeKind === "data"),
    ),
  });

  const rowsQuery = useQuery({
    queryKey: [
      "table-rows",
      selectedId,
      selectedTable?.schema,
      selectedTable?.name,
      pageSize,
      offset,
      orderBy,
      direction,
    ],
    queryFn: ({ signal }) =>
      databaseApi.browseRows(selectedId, selectedTable?.name ?? "", {
        schema: selectedTable?.schema,
        limit: pageSize,
        offset,
        orderBy,
        direction,
        signal,
      }),
    enabled: Boolean(selectedId && selectedTable && activeKind === "data"),
    placeholderData: (previous) => previous,
  });

  const sort = (column: string) => {
    setDirection((current) => (orderBy === column ? (current === "asc" ? "desc" : "asc") : "asc"));
    setOrderBy(column);
  };

  const changePageSize = (size: number) => {
    setPageSize(size);
    setOffset(0);
  };

  return {
    rowsQuery,
    structureQuery,
    pageSize,
    changePageSize,
    offset,
    setOffset,
    orderBy,
    direction,
    sort,
    resetPage: () => setOffset(0),
  };
}
