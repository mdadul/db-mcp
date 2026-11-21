import type { ReactNode } from "react";

/** Compact section with a title, optional description, and content. */
export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="mb-7"><div className="mb-2.5"><h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>{description && <p className="mt-1 text-[12px] text-muted-foreground">{description}</p>}</div>{children}</section>;
}
