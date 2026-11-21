import type { ReactNode } from "react";

/** Semantic toolbar wrapper for compact desktop actions. */
export function Toolbar({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div role="toolbar" className={`flex items-center gap-1 ${className}`}>{children}</div>;
}
