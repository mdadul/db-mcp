import { Copy, RotateCw, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AiClientList } from "@/features/ai-clients/components/AiClientList";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { InlineHelp } from "@/components/ui/InlineHelp";
import { useServerInfo } from "@/platform/hooks";

export function AiClientsPage() {
  const { data: serverInfo } = useServerInfo();
  const queryClient = useQueryClient();
  const mcpUrl = serverInfo?.mcpUrl ?? "http://127.0.0.1:4080/mcp";
  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(mcpUrl); toast.success("MCP URL copied"); }
    catch { toast.error("Could not copy MCP URL"); }
  };
  return <div className="mx-auto w-full max-w-6xl px-6 py-7">
    <PageHeader title="AI clients" description="Connect local AI tools to your enabled databases." actions={<><Button variant="ghost" size="sm" onClick={() => void queryClient.invalidateQueries({ queryKey: ["ai-clients"] })}><RotateCw data-icon="inline-start" />Refresh</Button><Button variant="outline" size="sm" onClick={() => void copyUrl()}><Copy data-icon="inline-start" />{mcpUrl}</Button></>} />
    <div className="mb-5 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5"><ShieldCheck className="size-4 shrink-0 text-muted-foreground" /><p className="text-secondary text-muted-foreground">AI clients on this computer can query your enabled databases through this address.</p><InlineHelp label="About local-only access" content="Any program running as your user can reach this local address. Database queries are read-only." /></div>
    <AiClientList mcpUrl={mcpUrl} />
  </div>;
}
