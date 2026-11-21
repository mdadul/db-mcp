import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";

/** Info affordance with touch-accessible disclosure for longer explanations. */
export function InlineHelp({ content, label = "More information" }: { content: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return <span className="relative inline-flex align-middle"><Tooltip content={content}><Button type="button" variant="ghost" size="icon-xs" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)}><Info /></Button></Tooltip>{open && <span role="note" className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border border-border bg-popover p-2 text-[12px] text-popover-foreground shadow-lg">{content}</span>}</span>;
}
