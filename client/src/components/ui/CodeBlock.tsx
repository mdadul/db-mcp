import { CopyButton } from "@/components/ui/CopyButton";

/** Selectable monospaced text panel with a one-click copy action. */
export function CodeBlock({ value, className = "", wrap = false }: { value: string; className?: string; wrap?: boolean }) {
  return <div className={`relative min-w-0 overflow-hidden rounded-md border border-border bg-background ${className}`}><div className="absolute right-1 top-1 z-10"><CopyButton value={value} /></div><pre data-selectable="true" className={`max-h-72 overflow-auto p-3 pr-20 text-code leading-relaxed text-muted-foreground ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}>{value}</pre></div>;
}
