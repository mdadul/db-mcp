import type { ReactNode } from "react";

/** Reassuring empty state for pages and lists. */
export function EmptyState({ title, description, icon, action, secondaryAction }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode; secondaryAction?: ReactNode }) {
  return <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-8 text-center">{icon && <div className="mb-3 text-muted-foreground">{icon}</div>}<h2 className="text-body font-semibold">{title}</h2>{description && <p className="mt-1 max-w-md text-secondary text-muted-foreground">{description}</p>}{(action || secondaryAction) && <div className="mt-4 flex items-center gap-2">{action}{secondaryAction}</div>}</div>;
}
