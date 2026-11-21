import type { ReactNode } from "react";

/** System Settings-style row with explanatory copy and a trailing control. */
export function SettingRow({ title, description, control, disabled = false, className = "" }: { title: string; description?: string; control: ReactNode; disabled?: boolean; className?: string }) {
  return <div className={`settings-row flex items-center justify-between gap-5 px-3.5 py-3 ${disabled ? "opacity-60" : ""} ${className}`}><div className="min-w-0"><p className="text-[13px] font-medium">{title}</p>{description && <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>}</div><div className="settings-row-control flex shrink-0 items-center gap-2">{control}</div></div>;
}
