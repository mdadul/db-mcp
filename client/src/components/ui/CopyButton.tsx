import { Check, Copy as CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

/** Copy text to the clipboard with compact feedback. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`${label} to clipboard`}
      onClick={() => void copy(value, label)}
    >
      {copied === label ? (
        <Check data-icon="inline-start" />
      ) : (
        <CopyIcon data-icon="inline-start" />
      )}
      {copied === label ? "Copied" : label}
    </Button>
  );
}
