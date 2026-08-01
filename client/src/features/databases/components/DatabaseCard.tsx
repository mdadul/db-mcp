import { useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";
import {
  Copy,
  Check,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Database,
  Play,
} from "@/components/ui/Icons";
import {
  testingIdAtom,
  testResultsAtom,
  toggleStatusAtom,
  testConnectionAtom,
} from "../atoms/databaseAtoms";
import type { DatabaseConnection } from "../types";

export interface DatabaseCardProps {
  database: DatabaseConnection;
  displayMode?: "comfortable" | "dense" | "monitor";
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onDeleteRequest: (db: DatabaseConnection) => void;
  onOpenDetails: (db: DatabaseConnection) => void;
}

export function DatabaseCard({
  database,
  displayMode = "comfortable",
  isSelected = false,
  onToggleSelect,
  onDeleteRequest,
  onOpenDetails,
}: DatabaseCardProps) {
  const navigate = useNavigate();
  const [copiedHost, setCopiedHost] = useState(false);

  const testingId = useAtomValue(testingIdAtom);
  const testResults = useAtomValue(testResultsAtom);

  const toggleStatus = useSetAtom(toggleStatusAtom);
  const testConnection = useSetAtom(testConnectionAtom);

  const isTesting = testingId === database.id;
  const testResult = testResults[database.id];
  const isDense = displayMode === "dense";
  const isMonitor = displayMode === "monitor";

  const handleCopyHost = async () => {
    const connStr = `${database.host}:${database.port}/${database.databaseName}`;
    try {
      await navigator.clipboard.writeText(connStr);
      setCopiedHost(true);
      toast.add({ type: "info", title: `Copied "${connStr}" to clipboard` });
      setTimeout(() => setCopiedHost(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <Card
      className={`group relative overflow-hidden border-border bg-background shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl flex flex-col ${
        isSelected ? "border-primary/30 ring-2 ring-ring shadow-primary/20" : "hover:border-primary/30"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-r from-background via-muted to-accent" />

      {/* Header: Icon + Name + Status */}
      <div
        className={`relative z-10 border-b border-border bg-linear-to-r from-card/90 to-accent flex items-center justify-between ${
          isDense ? "px-3.5 py-2.5" : isMonitor ? "px-5 py-4" : "px-4 py-3.5"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(database.id)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
            />
          )}

          <div
            className={`rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0 text-primary shadow-sm ${
              isDense ? "h-8 w-8" : isMonitor ? "h-10 w-10" : "h-9 w-9"
            }`}
          >
            <Database className={`${isMonitor ? "w-5 h-5" : "w-4 h-4"}`} />
          </div>

          <div className="min-w-0">
            <h3 className={`font-bold text-foreground truncate ${isMonitor ? "text-base" : "text-sm"}`}>
              {database.name}
            </h3>
            <p className={`text-muted-foreground truncate mt-0.5 ${isMonitor ? "text-sm" : "text-xs"}`}>
              {database.type === "mysql" ? "MySQL" : "PostgreSQL"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Live
          </span>
          <Switch
            checked={database.status === "enabled"}
            onCheckedChange={() => toggleStatus(database)}
          />
        </div>
      </div>

      {/* Body: Connection details */}
      <div
        className={`relative z-10 flex-1 ${
          isDense ? "px-3.5 py-3 space-y-2.5" : isMonitor ? "px-5 py-5 space-y-3.5" : "px-4 py-4 space-y-3"
        }`}
      >
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={database.status === "enabled" ? "secondary" : "outline"}
            className={`${isMonitor ? "text-sm" : "text-xs"} ${database.status === "enabled" ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"}`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${database.status === "enabled" ? "bg-primary/10 animate-pulse" : "bg-muted"}`} />
            {database.status}
          </Badge>
          {database.environment && (
            <Badge variant="secondary" className={`${isMonitor ? "text-sm" : "text-xs"} bg-primary/10 text-primary border-primary/30`}>
              {database.environment}
            </Badge>
          )}
          {database.ssl && (
            <Badge variant="secondary" className={`${isMonitor ? "text-sm" : "text-xs"} bg-primary/10 text-primary border-primary/30`}>
              SSL
            </Badge>
          )}
        </div>

        {/* Connection string */}
        <div className="space-y-1.5">
          <p className={`${isMonitor ? "text-xs" : "text-[11px]"} font-semibold text-muted-foreground uppercase tracking-wider`}>Connection</p>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted p-2.5 shadow-inner">
            <code className={`${isMonitor ? "text-sm" : "text-xs"} font-mono text-primary truncate`}>
              {database.host}:{database.port}/{database.databaseName}
            </code>
            <button
              onClick={handleCopyHost}
              title="Copy connection string"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0"
            >
              {copiedHost ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Service metadata */}
        {database.serviceName && (
          <div className="space-y-1.5">
            <p className={`${isMonitor ? "text-xs" : "text-[11px]"} font-semibold text-muted-foreground uppercase tracking-wider`}>Service</p>
            <p className={`${isMonitor ? "text-base" : "text-sm"} text-muted-foreground font-medium`}>{database.serviceName}</p>
          </div>
        )}

        {/* Test result banner */}
        {testResult && (
          <div
            className={`mt-2 px-3 py-2 rounded-lg text-xs transition-all ${
              testResult.success
                ? "bg-primary/10 text-primary border border-primary/30"
                : "bg-destructive/10 text-destructive border border-destructive/30"
            }`}
          >
            <div className="flex items-start gap-2">
              {testResult.success ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <p className="font-semibold">{testResult.message}</p>
                {!testResult.success && testResult.hint && (
                  <p className="text-[10px] opacity-90 leading-relaxed">{testResult.hint}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer: Action buttons */}
      <div
        className={`relative z-10 border-t border-border bg-linear-to-b from-background to-muted flex items-center justify-between gap-2 ${
          isDense ? "px-3.5 py-2.5" : isMonitor ? "px-5 py-4" : "px-4 py-3"
        }`}
      >
        <Button
          variant="default"
          size="sm"
          onClick={() => onOpenDetails(database)}
          title="Open Workbench"
          className={`flex-1 font-semibold shadow-sm ${isMonitor ? "text-sm h-10" : "text-xs"}`}
        >
          <Play className="w-3 h-3 mr-1 fill-current" />
          Workbench
        </Button>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={isTesting}
            onClick={() => testConnection(database.id)}
            title="Test Connection"
            className={`${isMonitor ? "text-sm h-10" : "text-xs"} border-border`}
          >
            {isTesting ? "Testing..." : "Test"}
          </Button>

          <Button
            variant="secondary"
            size="icon"
            onClick={() => navigate(`/${database.id}/edit`)}
            title="Edit Connection"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="destructive"
            size="icon"
            onClick={() => onDeleteRequest(database)}
            title="Delete Connection"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
