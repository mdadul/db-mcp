import type { ReactNode } from "react";

/** Muted helper copy with an optional inline action or documentation link. */
export function Hint({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-ui-sm leading-relaxed text-muted-foreground ${className}`}>{children}</p>
  );
}
