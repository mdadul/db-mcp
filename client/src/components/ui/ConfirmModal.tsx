import { AlertTriangle, HelpCircle } from "./Icons";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogDescription } from "./Dialog";

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
        <div className="flex items-start gap-4">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
              variant === "danger"
                ? "bg-destructive/10 text-destructive border border-destructive/30"
                : "bg-primary/10 text-primary border border-primary/30"
            }`}
          >
            {variant === "danger" ? (
              <AlertTriangle className="w-5 h-5 text-destructive" />
            ) : (
              <HelpCircle className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="flex-1">
            <DialogTitle className="text-base font-bold">{title}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm mt-1">
              {description}
            </DialogDescription>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
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
