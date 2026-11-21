import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";

/** Confirmation dialog with an optional exact phrase gate for destructive actions. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, confirmationText, pending = false, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel: string; confirmationText?: string; pending?: boolean; onConfirm: () => void }) {
  const [value, setValue] = useState("");
  const canConfirm = !pending && (!confirmationText || value === confirmationText);
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) { if (!next) setValue(""); onOpenChange(next); } }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><div className="flex size-8 items-center justify-center rounded-md bg-danger-subtle text-danger"><AlertTriangle className="size-4" /></div><DialogTitle>{title}</DialogTitle><DialogDescription>{description}{confirmationText && <> Type <code className="font-mono text-foreground">{confirmationText}</code> to confirm.</>}</DialogDescription></DialogHeader>{confirmationText && <Input autoFocus value={value} onChange={(event) => setValue(event.target.value)} aria-label={`Type ${confirmationText} to confirm`} className="font-mono" />}<DialogFooter><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="destructive" disabled={!canConfirm} onClick={onConfirm}>{pending ? "Working…" : confirmLabel}</Button></DialogFooter></DialogContent></Dialog>;
}
