import type { ReactNode } from "react";
import { Check, Copy as CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="mb-8"><div className="mb-3"><h2 className="text-sm font-semibold">{title}</h2>{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}</div>{children}</section>;
}

export function EmptyState({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
    {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
    <h2 className="text-sm font-semibold">{title}</h2>
    {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex min-h-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] leading-none text-muted-foreground">{children}</kbd>;
}

export function StatusDot({ state }: { state: "healthy" | "warning" | "error" | "neutral" }) {
  const classes = { healthy: "bg-emerald-500", warning: "bg-amber-500", error: "bg-destructive", neutral: "bg-muted-foreground" };
  return <span aria-hidden="true" className={`inline-flex size-2 rounded-full ${classes[state]}`} />;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const { copied, copy } = useCopyToClipboard();
  return <Button variant="ghost" size="sm" aria-label={`${label} to clipboard`} onClick={() => void copy(value, label)}>
    {copied === label ? <Check data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}{copied === label ? "Copied" : label}
  </Button>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-muted ${className}`} />;
}
