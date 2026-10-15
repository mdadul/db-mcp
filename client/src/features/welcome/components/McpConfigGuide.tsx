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
    note: "Claude.ai web enforces HTTPS. A local http:// URL will be rejected — expose the gateway via a tunnel first.",
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
      // Fallback
    }
  };

  return (
    <section className="mb-20 sm:mb-28 rounded-[14px] bg-white p-7 sm:p-10 border border-[#EEEEEE] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)]">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pb-6 border-b border-[#EEEEEE]">
        <div>
          <span className="text-xs text-[#737373] uppercase tracking-wider block mb-2 font-normal">
            Integration
          </span>
          <h2 className="text-2xl sm:text-3xl font-medium text-[#0A0A0A] tracking-tight">
            Connect your AI tool in under a minute
          </h2>
          <p className="text-sm text-[#4D4D4D] mt-1.5 leading-relaxed">
            Select your developer environment and copy the configuration payload.
          </p>
        </div>

        {/* Tab buttons */}
        <div className="flex items-center gap-1.5 bg-[#F8F8F8] p-1.5 rounded-[10px] border border-[#EEEEEE] overflow-x-auto">
          {(["claude", "cursor", "web", "http"] as ToolType[]).map((tool) => (
            <button
              key={tool}
              onClick={() => setActiveTool(tool)}
              className={`px-3.5 py-1.5 text-xs rounded-[8px] transition-colors shrink-0 cursor-pointer ${
                activeTool === tool
                  ? "bg-[#E5E5E5] text-[#0A0A0A] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  : "text-[#4D4D4D] hover:text-[#0A0A0A] hover:bg-white"
              }`}
            >
              {tool === "claude" ? "Claude Code"
                : tool === "cursor" ? "Cursor / Desktop"
                : tool === "web" ? "Claude.ai Web"
                : "HTTP API"}
            </button>
          ))}
        </div>
      </div>

      {/* Code Snippet Box */}
      <div className="bg-[#141414] text-[#E5E5E5] rounded-[10px] p-5 border border-[#262626]">
        <div className="flex items-center justify-between mb-3 text-xs text-[#888888] border-b border-[#262626] pb-3">
          <span className="font-mono text-[#CCCCCC]">{activeSnippet.filename}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            className="h-7 text-xs px-3 bg-[#262626] border-[#333333] text-[#E5E5E5] hover:bg-[#333333] hover:text-white"
          >
            {copied ? "Copied ✓" : "Copy Snippet"}
          </Button>
        </div>

        <pre className="text-xs text-[#E5E5E5] overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
          {activeSnippet.snippet}
        </pre>
      </div>

      {activeSnippet.note && (
        <p className="text-xs text-[#D64545] mt-4 leading-relaxed flex items-center gap-1.5">
          <span>Notice:</span>
          <span>{activeSnippet.note}</span>
        </p>
      )}

      <p className="text-xs text-[#737373] mt-4 leading-relaxed">
        Tip: Replace <code className="text-[#0A0A0A] bg-[#EEEEEE] px-1.5 py-0.5 rounded font-mono">&lt;MCP_TOKEN&gt;</code> with the bearer token defined in your server environment (<code className="text-[#0A0A0A] bg-[#EEEEEE] px-1.5 py-0.5 rounded font-mono">MCP_TOKEN</code>).
      </p>
    </section>
  );
}
