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
    <div className="bg-white text-[#0A0A0A] rounded-[14px] p-4 shadow-[0_4px_16px_rgba(0,0,0,0.06)] flex flex-wrap items-center justify-between gap-4 mb-4 border border-[#EEEEEE]">
      <div className="flex items-center gap-3">
        <span className="w-6 h-6 rounded-full bg-[#E5E5E5] text-[#0A0A0A] font-medium text-xs flex items-center justify-center">
          {selectedIds.length}
        </span>
        <span className="text-xs text-[#4D4D4D]">
          {selectedIds.length} connection{selectedIds.length > 1 ? "s" : ""} selected
        </span>
        <button
          onClick={onClearSelection}
          className="text-xs text-[#737373] hover:text-[#0A0A0A] underline cursor-pointer"
        >
          Deselect all
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={onBulkEnable}
          className="text-xs"
        >
          Enable Selected
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={onBulkDisable}
          className="text-xs text-[#737373]"
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
