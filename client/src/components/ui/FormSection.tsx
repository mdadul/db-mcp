import type { ReactNode } from "react";

/** Titled grouping for longer forms. */
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="flex flex-col gap-3 border-b border-border pb-5"><header><h2 className="text-body font-semibold">{title}</h2>{description && <p className="mt-1 text-secondary text-muted-foreground">{description}</p>}</header>{children}</section>;
}
