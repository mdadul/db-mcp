import type { ReactNode } from "react";

/** Desktop page title and optional contextual actions. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="mb-3 flex flex-wrap items-start justify-between gap-3">{description && <p className="min-w-0 truncate text-[12px] text-muted-foreground">{description}</p>}{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}</header>;
}
