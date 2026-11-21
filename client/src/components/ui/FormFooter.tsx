import type { ReactNode } from "react";

/** Sticky form action bar for save/cancel actions and unsaved state. */
export function FormFooter({ children, status, className = "" }: { children: ReactNode; status?: string; className?: string }) {
  return <footer className={`sticky bottom-0 z-10 flex min-h-12 items-center justify-between gap-3 border-t border-border bg-surface/95 px-3 py-2 backdrop-blur ${className}`}><span role="status" className="text-[12px] text-muted-foreground">{status}</span><div className="flex items-center gap-2">{children}</div></footer>;
}
