import { useState } from "react";
import { Button } from "@/components/ui/Button";

const MCP_SNIPPET = `{
  "mcpServers": {
    "db-mcp": {
      "url": "http://localhost:4080/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}`;

export function McpSnippetCard() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(MCP_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is not available
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-muted p-5 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.18em]">
          Connect Claude Code
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          {copied ? "Copied! ✓" : "Copy Config"}
        </Button>
      </div>
      <pre className="max-h-[320px] overflow-x-auto rounded-xl border border-border bg-muted p-3 text-xs text-primary whitespace-pre-wrap break-all font-mono">
        {MCP_SNIPPET}
      </pre>
    </div>
  );
}
