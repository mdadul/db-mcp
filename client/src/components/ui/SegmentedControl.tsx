import type { ReactNode } from "react";

/** Compact keyboard-friendly control for choosing one of a few values. */
export function SegmentedControl<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: readonly { value: T; label: string; icon?: ReactNode }[]; onChange: (value: T) => void; ariaLabel: string }) {
  return <div role="group" aria-label={ariaLabel} className="inline-flex max-w-full items-center gap-0.5 rounded-md border border-border bg-muted/70 p-0.5">{options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={`inline-flex h-6 items-center justify-center gap-1.5 rounded px-2 text-ui-sm capitalize transition-colors ${value === option.value ? "bg-surface-raised text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{option.icon}{option.label}</button>)}</div>;
}
