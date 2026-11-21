import { useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Inline alert banner for app-wide status and recoverable warnings. */
export function Banner({ variant = "info", children, dismissible = false }: { variant?: "info" | "warning" | "danger"; children: ReactNode; dismissible?: boolean }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  const Icon = variant === "info" ? Info : variant === "warning" ? AlertTriangle : AlertCircle;
  const styles = { info: "border-info/30 bg-info-subtle text-info", warning: "border-warning/30 bg-warning-subtle text-warning", danger: "border-danger/30 bg-danger-subtle text-danger" };
  return <div role="status" className={`flex items-start gap-2 border px-3 py-2 text-secondary ${styles[variant]}`}><Icon className="mt-0.5 size-3.5 shrink-0" /><div className="min-w-0 flex-1 text-foreground">{children}</div>{dismissible && <Button variant="ghost" size="icon-xs" aria-label="Dismiss message" onClick={() => setVisible(false)}><X /></Button>}</div>;
}
