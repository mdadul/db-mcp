import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useServerInfo } from "@/platform/hooks";

export function McpSnippetCard() {
  const [copied, setCopied] = useState(false);
  const { data: serverInfo } = useServerInfo();
  const mcpSnippet = JSON.stringify({ mcpServers: { "db-mcp": { url: serverInfo?.mcpUrl ?? "" } } }, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mcpSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is not available
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-muted p-5 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-scale-xs font-semibold text-muted-foreground uppercase tracking-[0.18em]">
          Connect Claude Code
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="text-scale-xs text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          {copied ? "Copied! ✓" : "Copy Config"}
        </Button>
      </div>
      <pre className="max-h-[320px] overflow-x-auto rounded-xl border border-border bg-muted p-3 text-scale-xs text-primary whitespace-pre-wrap break-all font-mono">
        {mcpSnippet}
      </pre>
    </div>
  );
}
