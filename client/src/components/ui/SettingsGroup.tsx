import type { ReactNode } from "react";

/** Inset, rounded container for related setting rows. */
export function SettingsGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`settings-group ${className}`}>{children}</div>;
}
