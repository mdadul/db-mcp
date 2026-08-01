import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Database, Compass, Server, Plus, Activity, Copy, Check } from "@/components/ui/Icons";
import { Button, buttonVariants } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

export function Navbar() {
  const location = useLocation();
  const [copiedMcpUrl, setCopiedMcpUrl] = useState(false);

  const isDatabases = location.pathname.startsWith("/databases") || location.pathname === "/";
  const isWelcome = location.pathname === "/welcome";

  const handleCopyMcpUrl = async () => {
    const url = "http://localhost:4080/mcp";
    try {
      await navigator.clipboard.writeText(url);
      setCopiedMcpUrl(true);
      toast.add({ type: "info", title: `Copied MCP Server URL: ${url}` });
      setTimeout(() => setCopiedMcpUrl(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <header className="bg-background/90 backdrop-blur-md border-b border-border sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand & Navigation */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
                <Database className="w-4 h-4" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-foreground text-base leading-tight tracking-tight">
                DB MCP Gateway
              </span>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
                Control Plane v1.0
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden sm:flex items-center gap-1 pl-4 border-l border-border">
            <Link
              to="/databases"
              className={cn(
                buttonVariants({ variant: isDatabases ? "secondary" : "ghost", size: "sm" }),
                "gap-1.5"
              )}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </Link>
            <Link
              to="/welcome"
              className={cn(
                buttonVariants({ variant: isWelcome ? "secondary" : "ghost", size: "sm" }),
                "gap-1.5"
              )}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Guide</span>
            </Link>
          </nav>
        </div>

        {/* Server Status & CTA */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleCopyMcpUrl}
            title="Click to copy MCP Server Endpoint URL"
            variant="secondary"
            size="sm"
            className="hidden lg:flex rounded-full text-[11px]"
          >
            <Activity className="w-3 h-3 text-primary animate-pulse" />
            <span>MCP Gateway Online</span>
            {copiedMcpUrl ? (
              <Check className="w-3 h-3 text-primary ml-1" />
            ) : (
              <Copy className="w-3 h-3 text-muted-foreground ml-1" />
            )}
          </Button>

          <Link
            to="/new"
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Connection</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
