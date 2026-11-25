import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";

/** Accessible Base UI tooltip for short, supplementary labels. */
export function Tooltip({
  children,
  content,
  side = "top",
}: {
  children: ReactElement;
  content: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={6} className="z-50">
          <TooltipPrimitive.Popup className="max-w-64 rounded-md border border-border bg-popover px-2 py-1 text-ui-xs text-popover-foreground shadow-lg">
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
