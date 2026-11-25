import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { TableStructure } from "../types";

export function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div
      className="m-3 rounded-md border border-danger/30 bg-danger-subtle p-3 text-ui-sm text-danger"
      role="alert"
    >
      <p>{message}</p>
      <Button variant="outline" size="xs" className="mt-2" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}

/** Columns, indexes and foreign keys for the open table. */
export function StructureView({
  query,
  onOpenTable,
}: {
  query: UseQueryResult<TableStructure>;
  onOpenTable: (schema: string, table: string) => void;
}) {
  if (query.isLoading)
    return (
      <div className="space-y-2 p-3" role="status" aria-label="Loading table structure">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-7 w-full" key={index} />
        ))}
      </div>
    );
  if (query.isError)
    return <ErrorPanel message={query.error.message} retry={() => void query.refetch()} />;
  const structure = query.data;
  if (!structure)
    return (
      <EmptyState
        title="Select a table"
        description="Choose a table in the schema pane to inspect its structure."
      />
    );
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-ui font-semibold">
            {structure.schema}.{structure.name}
          </h2>
          <p className="text-ui-xs text-muted-foreground">
            {structure.rowEstimate === null
              ? "Row estimate unavailable"
              : `~${structure.rowEstimate.toLocaleString()} rows`}
          </p>
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={() => onOpenTable(structure.schema, structure.name)}
        >
          Open data
        </Button>
      </header>
      <h3 className="mb-1 text-ui-xs font-semibold">Columns</h3>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-left text-ui-xs">
          <thead className="bg-muted">
            <tr>
              {["Name", "Type", "Nullable", "Default", "Key", "Comment"].map((label) => (
                <th key={label} className="px-2 py-1.5 font-medium text-muted-foreground">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {structure.columns.map((column) => (
              <tr key={column.name} className="border-t border-border">
                <td className="px-2 py-1.5 font-mono">{column.name}</td>
                <td className="px-2 py-1.5 font-mono text-muted-foreground">{column.dataType}</td>
                <td className="px-2 py-1.5">{column.nullable ? "Yes" : "No"}</td>
                <td className="px-2 py-1.5 font-mono">{column.default ?? "—"}</td>
                <td className="px-2 py-1.5">{column.isPrimaryKey ? "PK" : ""}</td>
                <td className="max-w-64 truncate px-2 py-1.5 text-muted-foreground">
                  {column.comment ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mb-1 mt-4 text-ui-xs font-semibold">Indexes</h3>
      <MetadataTable
        headings={["Name", "Columns", "Type"]}
        rows={structure.indexes.map((index) => [
          index.name,
          index.columns.join(", "),
          index.primary ? "Primary" : index.unique ? "Unique" : "Index",
        ])}
      />
      <h3 className="mb-1 mt-4 text-ui-xs font-semibold">Foreign keys</h3>
      <MetadataTable
        headings={["Name", "Columns", "References"]}
        rows={structure.foreignKeys.map((key) => [
          key.name,
          key.columns.join(", "),
          `${key.refSchema ? `${key.refSchema}.` : ""}${key.refTable} (${key.refColumns.join(", ")})`,
        ])}
      />
    </div>
  );
}

function MetadataTable({ headings, rows }: { headings: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-left text-ui-xs">
        <thead className="bg-muted">
          <tr>
            {headings.map((heading) => (
              <th key={heading} className="px-2 py-1.5 font-medium text-muted-foreground">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={`${row[0]}-${index}`} className="border-t border-border">
                {row.map((cell, cellIndex) => (
                  <td key={`${cellIndex}-${cell}`} className="px-2 py-1.5 font-mono">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-2 py-2 text-muted-foreground" colSpan={headings.length}>
                None
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
