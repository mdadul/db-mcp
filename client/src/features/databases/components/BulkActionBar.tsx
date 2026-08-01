import { Button } from "@/components/ui/Button";

export interface BulkActionBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onBulkEnable: () => void;
  onBulkDisable: () => void;
  onBulkDelete: () => void;
  isLoading?: boolean;
}

export function BulkActionBar({
  selectedIds,
  onClearSelection,
  onBulkEnable,
  onBulkDisable,
  onBulkDelete,
  isLoading = false,
}: BulkActionBarProps) {
  if (selectedIds.length === 0) return null;

  return (
    <div className="bg-muted text-foreground rounded-xl p-3.5 shadow-xl flex items-center justify-between gap-4 mb-4 animate-in fade-in slide-in-from-top-2 border border-border">
      <div className="flex items-center gap-3">
        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
          {selectedIds.length}
        </span>
        <span className="text-xs font-semibold text-muted-foreground">
          Connection{selectedIds.length > 1 ? "s" : ""} selected
        </span>
        <button
          onClick={onClearSelection}
          className="text-xs text-muted-foreground hover:text-foreground underline font-medium"
        >
          Deselect all
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={isLoading}
          onClick={onBulkEnable}
          className="text-xs bg-muted border-border text-primary hover:bg-muted"
        >
          Enable Selected
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={isLoading}
          onClick={onBulkDisable}
          className="text-xs bg-muted border-border text-destructive hover:bg-muted"
        >
          Disable Selected
        </Button>

        <Button
          variant="destructive"
          size="sm"
          disabled={isLoading}
          onClick={onBulkDelete}
          className="text-xs"
        >
          Delete Selected
        </Button>
      </div>
    </div>
  );
}
