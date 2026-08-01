import React from "react";

export interface HeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  action?: React.ReactNode;
}

export function Header({ title, subtitle, backTo, action }: HeaderProps) {
  return (
    <div className="flex items-start justify-between mb-8 gap-4">
      <div className="flex items-center gap-3">
        {backTo && (
          <a
            href={backTo}
            className="text-muted-foreground hover:text-muted-foreground transition-colors text-lg leading-none"
            aria-label="Back"
          >
            ←
          </a>
        )}
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
