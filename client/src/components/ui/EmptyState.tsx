import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-gradient-to-b from-muted/40 to-muted/20 p-10 text-center overflow-hidden animate-fade-in",
        className
      )}
      {...props}
    >
      {/* Decorative background glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/0 via-primary/3 to-primary/0 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      {icon && (
        <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/20 shadow-[0_0_16px_color-mix(in_oklab,var(--primary)_15%,transparent)]">
          {icon}
        </div>
      )}
      <h3 className="relative text-lg font-bold text-foreground">{title}</h3>
      {description && (
        <p className="relative mt-2 text-sm text-muted-foreground max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="relative mt-6">{action}</div>}
    </div>
  )
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
