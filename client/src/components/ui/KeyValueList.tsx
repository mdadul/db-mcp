import type { ReactNode } from "react";

/** Compact definition list for read-only detail panels. */
export function KeyValueList({ items, className = "" }: { items: readonly { label: string; value: ReactNode }[]; className?: string }) {
  return <dl className={`divide-y divide-border ${className}`}>{items.map(({ label, value }) => <div key={label} className="grid min-w-0 grid-cols-[minmax(100px,0.7fr)_minmax(0,1.3fr)] gap-4 py-2.5"><dt className="truncate text-ui-sm text-muted-foreground" title={label}>{label}</dt><dd className="min-w-0 break-words text-ui">{value}</dd></div>)}</dl>;
}
