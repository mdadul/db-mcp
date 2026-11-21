import { Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AiClientList } from "@/features/ai-clients/components/AiClientList";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/primitives";
import { useServerInfo } from "@/platform/hooks";

export function AiClientsPage() {
  const { data: serverInfo } = useServerInfo();
  const mcpUrl = serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp";
  const copyUrl = async () => {
    await navigator.clipboard.writeText(mcpUrl);
    toast.success("MCP URL copied");
  };
  return <div className="mx-auto w-full max-w-6xl px-6 py-7">
    <PageHeader title="AI clients" description="Configure local AI tools to connect to your databases through MCP." actions={<Button variant="outline" size="sm" onClick={() => void copyUrl()}><Copy data-icon="inline-start" />Copy MCP URL</Button>} />
    <div className="mb-5 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3"><ShieldCheck className="size-4 shrink-0 text-muted-foreground" /><p className="text-xs text-muted-foreground">MCP endpoint <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{mcpUrl}</code> only accepts local connections from this computer.</p></div>
    <AiClientList />
  </div>;
}
