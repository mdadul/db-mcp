import { AlertTriangle, HelpCircle } from "@/components/ui/Icons";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/Dialog";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3.5">
          <div
            className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${
              variant === "danger"
                ? "bg-[#D64545]/10 text-[#D64545] border border-[#D64545]/20"
                : "bg-[#E5E5E5] text-[#0A0A0A] border border-[#EEEEEE]"
            }`}
          >
            {variant === "danger" ? (
              <AlertTriangle className="w-4 h-4 text-[#D64545]" />
            ) : (
              <HelpCircle className="w-4 h-4 text-[#0A0A0A]" />
            )}
          </div>
          <div className="flex-1">
            <DialogTitle className="text-sm font-medium text-[#0A0A0A]">{title}</DialogTitle>
            <DialogDescription className="text-xs text-[#737373] mt-1">
              {description}
            </DialogDescription>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
            className="border-[#EEEEEE] text-[#4D4D4D]"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "destructive" : "default"}
            size="sm"
            disabled={isLoading}
            onClick={onConfirm}
          >
            {isLoading ? "Working..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
