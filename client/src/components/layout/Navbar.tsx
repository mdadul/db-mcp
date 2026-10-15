import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Database, Compass, Server, Plus, Activity, Copy, Check } from "@/components/ui/Icons";
import { buttonVariants } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type GatewayStatus = "checking" | "online" | "offline";

// Polls the gateway's own health endpoint so the badge reflects reality.
function useGatewayStatus(intervalMs = 15000): GatewayStatus {
  const [status, setStatus] = useState<GatewayStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!cancelled) setStatus(res.ok ? "online" : "offline");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    };
    check();
    const id = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return status;
}

const STATUS_STYLE: Record<GatewayStatus, { dot: string; label: string }> = {
  checking: { dot: "bg-[#A3A3A3]", label: "Checking gateway…" },
  online: { dot: "bg-[#22C55E]", label: "Gateway online" },
  offline: { dot: "bg-[#D64545]", label: "Gateway offline" },
};

export function Navbar() {
  const location = useLocation();
  const [copiedMcpUrl, setCopiedMcpUrl] = useState(false);
  const gatewayStatus = useGatewayStatus();

  const isDatabases = location.pathname.startsWith("/databases") || location.pathname === "/";
  const isWelcome = location.pathname === "/welcome";

  const handleCopyMcpUrl = async () => {
    // Built from the page origin so it's correct for PORT/HOST and reverse proxies.
    const url = `${window.location.origin}/mcp`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedMcpUrl(true);
      toast.add({ type: "info", title: `Copied MCP Server URL: ${url}` });
      setTimeout(() => setCopiedMcpUrl(false), 2000);
    } catch {
      toast.add({ type: "error", title: `Couldn't copy. Copy this URL manually: ${url}` });
    }
  };

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-[#EEEEEE] sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
        {/* Brand & Navigation */}
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-[10px] bg-[#E5E5E5] text-[#0A0A0A] flex items-center justify-center transition-colors group-hover:bg-[#DCDCDC]">
              <Database className="w-4 h-4" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-medium text-[#0A0A0A] text-base tracking-tight">
                DB MCP Gateway
              </span>
              <span className="text-[11px] text-[#737373]">
                Control Plane
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden sm:flex items-center gap-2 pl-6 border-l border-[#EEEEEE]">
            <Link
              to="/databases"
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-[8px] text-sm transition-colors duration-150",
                isDatabases
                  ? "text-[#0A0A0A] bg-[#EEEEEE] font-medium"
                  : "text-[#4D4D4D] hover:text-[#0A0A0A] hover:bg-[#F8F8F8]"
              )}
            >
              <Server className="w-3.5 h-3.5" />
              Dashboard
            </Link>
            <Link
              to="/welcome"
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-[8px] text-sm transition-colors duration-150",
                isWelcome
                  ? "text-[#0A0A0A] bg-[#EEEEEE] font-medium"
                  : "text-[#4D4D4D] hover:text-[#0A0A0A] hover:bg-[#F8F8F8]"
              )}
            >
              <Compass className="w-3.5 h-3.5" />
              Guide
            </Link>
          </nav>
        </div>

        {/* Server Status & CTA */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyMcpUrl}
            title="Copy MCP server endpoint URL"
            className="hidden sm:flex items-center gap-2 rounded-full border border-[#EEEEEE] bg-white hover:bg-[#FAFAFA] px-3.5 py-1.5 text-xs text-[#4D4D4D] hover:text-[#0A0A0A] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.03)] cursor-pointer"
          >
            <span
              className={cn("inline-flex rounded-full h-2 w-2", STATUS_STYLE[gatewayStatus].dot)}
              aria-hidden="true"
            />
            <span>{STATUS_STYLE[gatewayStatus].label}</span>
            {copiedMcpUrl ? (
              <Check className="w-3 h-3 text-[#22C55E]" />
            ) : (
              <Copy className="w-3 h-3 opacity-40 group-hover:opacity-80 transition-opacity" />
            )}
          </button>

          <Link
            to="/new"
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "gap-1.5 font-normal"
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Connection</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
