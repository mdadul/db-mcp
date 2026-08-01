import { useState } from "react";
import { Button } from "@/components/ui/Button";

type ToolType = "claude" | "cursor" | "web" | "http";

const CONFIG_SNIPPETS: Record<ToolType, { title: string; filename: string; snippet: string; note?: string }> = {
  claude: {
    title: "Claude Code CLI",
    filename: "Run command in terminal",
    snippet: `claude mcp add --transport http db-mcp http://localhost:4080/mcp --header "Authorization: Bearer <MCP_TOKEN>"`,
  },
  cursor: {
    title: "Cursor / Windsurf / Claude Desktop",
    filename: "mcp.json",
    snippet: `{
  "mcpServers": {
    "db-mcp": {
      "url": "http://localhost:4080/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_TOKEN>"
      }
    }
  }
}`,
  },
  web: {
    title: "Claude.ai Web",
    filename: "Requires HTTPS — expose via tunnel first",
    snippet: `# 1. Expose your local server over HTTPS (pick one):
npx cloudflared tunnel --url http://localhost:4080
# or
ngrok http 4080

# 2. Copy the HTTPS URL from the tunnel output, e.g.:
#    https://abc123.trycloudflare.com

# 3. In Claude.ai → Settings → Integrations → Add MCP Server:
URL:     https://<tunnel-subdomain>.trycloudflare.com/mcp
Header:  Authorization: Bearer <MCP_TOKEN>`,
    note: "Claude.ai web enforces HTTPS (browser mixed-content policy). A local http:// URL will be rejected — you must expose the gateway via a tunnel first.",
  },
  http: {
    title: "Raw HTTP / Custom Client",
    filename: "HTTP POST — Streamable HTTP (stateless)",
    snippet: `POST http://localhost:4080/mcp
Content-Type: application/json
Authorization: Bearer <MCP_TOKEN>

{"jsonrpc":"2.0","method":"initialize","id":1,
 "params":{"protocolVersion":"2024-11-05","capabilities":{},
           "clientInfo":{"name":"my-client","version":"1.0"}}}`,
  },
};

export function McpConfigGuide() {
  const [activeTool, setActiveTool] = useState<ToolType>("claude");
  const [copied, setCopied] = useState(false);

  const activeSnippet = CONFIG_SNIPPETS[activeTool];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeSnippet.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is not available
    }
  };

  return (
    <div className="bg-muted rounded-3xl p-6 sm:p-8 text-foreground shadow-xl mb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">
            Connect your AI tool in under a minute
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Pick your environment and copy the snippet
          </p>
        </div>

        {/* Tab buttons */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border">
          {(["claude", "cursor", "web", "http"] as ToolType[]).map((tool) => (
            <button
              key={tool}
              onClick={() => setActiveTool(tool)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTool === tool
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tool === "claude" ? "Claude Code"
                : tool === "cursor" ? "Cursor / Desktop"
                : tool === "web" ? "Claude.ai Web"
                : "HTTP / Custom"}
            </button>
          ))}
        </div>
      </div>

      {/* Code Snippet Box */}
      <div className="bg-muted rounded-2xl p-5 border border-border">
        <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground border-b border-border pb-2">
          <span className="font-mono text-primary">{activeSnippet.filename}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? "Copied! ✓" : "Copy Snippet"}
          </Button>
        </div>

        <pre className="text-sm text-primary overflow-x-auto whitespace-pre-wrap break-all font-mono">
          {activeSnippet.snippet}
        </pre>
      </div>

      {activeSnippet.note && (
        <p className="text-xs text-destructive mt-3 leading-relaxed">
          ⚠️ {activeSnippet.note}
        </p>
      )}

      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        💡 Replace <code className="text-primary font-mono">&lt;MCP_TOKEN&gt;</code> with the bearer token configured in your server environment variable (<code className="text-muted-foreground font-mono">MCP_TOKEN</code>).
      </p>
    </div>
  );
}
