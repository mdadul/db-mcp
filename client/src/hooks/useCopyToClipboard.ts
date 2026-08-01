import { useState, useCallback } from "react";

export function useCopyToClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), resetMs);
      } catch {
        // clipboard unavailable — silently ignore
      }
    },
    [resetMs]
  );

  return { copied, copy };
}
