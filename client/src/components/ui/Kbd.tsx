import type { ReactNode } from "react";

/** Displays a native shortcut key. */
export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex min-h-5 items-center justify-center rounded border border-border-strong bg-surface-raised px-1.5 font-mono text-ui-xs leading-none text-muted-foreground ${className}`}
    >
      {children}
    </kbd>
  );
}
