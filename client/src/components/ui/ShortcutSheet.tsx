import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Kbd } from "@/components/ui/Kbd";
import { SHORTCUT_GROUPS, formatShortcut, shortcuts, type ShortcutOs } from "@/lib/shortcuts";

/** Reference for every keyboard shortcut, grouped by where it applies. */
export function ShortcutSheet({ open, onOpenChange, os }: { open: boolean; onOpenChange: (open: boolean) => void; os: ShortcutOs }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-[min(92vw,620px)]">
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>Navigate and work in DB MCP without leaving the keyboard.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => {
          const entries = shortcuts.filter((entry) => entry.group === group);
          if (!entries.length) return null;
          const headingId = `shortcut-group-${group.toLowerCase()}`;
          return <section key={group} aria-labelledby={headingId}>
            <h3 id={headingId} className="mb-2 text-ui-xs font-semibold uppercase tracking-wider text-text-subtle">{group}</h3>
            <ul className="flex flex-col gap-1.5">
              {entries.map((entry) => <li key={entry.id} className="flex min-h-6 items-baseline justify-between gap-4">
                <span className="min-w-0 text-ui-sm">{entry.label}{entry.context && <span className="ml-1 text-ui-xs text-muted-foreground">({entry.context})</span>}</span>
                <Kbd className="shrink-0">{formatShortcut(entry.keys, os)}</Kbd>
              </li>)}
            </ul>
          </section>;
        })}
      </div>
    </DialogContent>
  </Dialog>;
}
