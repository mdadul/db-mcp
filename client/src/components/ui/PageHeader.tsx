import type { ReactNode } from "react";

/** Page-owned title, optional description, and contextual actions. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
    <div className="min-w-0">
      <h1 className="text-ui-title font-semibold tracking-tight text-foreground">{title}</h1>
      {description && <p className="mt-0.5 text-ui-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}
