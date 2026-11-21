import type { ReactNode } from "react";

/** Frames an input with leading and trailing icons, text, or action buttons. */
export function InputGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-w-0 items-center gap-1.5 rounded-md border border-input bg-surface-raised px-2 shadow-[inset_0_1px_1px_rgb(0_0_0/0.04)] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background [&>input]:border-0 [&>input]:bg-transparent [&>input]:px-0 [&>input]:shadow-none [&>input]:focus-visible:ring-0 [&>input]:focus-visible:ring-offset-0 [&>input]:h-(--control-h) ${className}`}>{children}</div>;
}

/** Leading or trailing adornment for an InputGroup. */
export function InputGroupAddon({ children, side = "leading", className = "" }: { children: ReactNode; side?: "leading" | "trailing"; className?: string }) {
  return <span className={`flex shrink-0 items-center gap-1 text-secondary text-muted-foreground ${side === "trailing" ? "order-1" : ""} ${className}`}>{children}</span>;
}
