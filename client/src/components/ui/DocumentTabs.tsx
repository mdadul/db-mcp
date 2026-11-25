import { X } from "lucide-react";

export interface DocumentTab {
  id: string;
  label: string;
  dirty?: boolean;
  closable?: boolean;
}

/** Horizontally scrollable editor document tabs with dirty markers and close actions. */
export function DocumentTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  ariaLabel = "Open documents",
  className = "",
}: {
  tabs: readonly DocumentTab[];
  activeId?: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex min-w-0 items-end gap-0.5 overflow-x-auto border-b border-border ${className}`}
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex min-h-(--control-h-lg) min-w-0 max-w-52 shrink-0 items-center border-b-2 px-2 ${activeId === tab.id ? "border-primary bg-surface text-foreground" : "border-transparent text-muted-foreground hover:bg-muted"}`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeId === tab.id}
            onClick={() => onSelect(tab.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ui-sm outline-none"
          >
            <span className="truncate" title={tab.label}>
              {tab.label}
            </span>
            {tab.dirty && (
              <span
                aria-label="Unsaved changes"
                className="size-1.5 shrink-0 rounded-full bg-primary"
              />
            )}
          </button>
          {tab.closable !== false && onClose && (
            <button
              type="button"
              aria-label={`Close ${tab.label}`}
              onClick={() => onClose(tab.id)}
              className="ml-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
