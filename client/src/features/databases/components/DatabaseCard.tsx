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
    const connStr = database.databaseName
      ? `${database.host}:${database.port}/${database.databaseName}`
      : `${database.host}:${database.port}`;
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
      className={`group relative overflow-hidden rounded-[14px] border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] hover:border-[#CCCCCC] transition-all duration-200 flex flex-col p-0 ${
        isSelected ? "ring-2 ring-[#0A0A0A]" : ""
      }`}
    >
      {/* Header: Icon + Name + Status */}
      <div
        className={`border-b border-[#EEEEEE] bg-white flex items-center justify-between ${
          isDense ? "px-4 py-3" : isMonitor ? "px-6 py-4" : "px-5 py-4"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(database.id)}
              className="w-4 h-4 rounded border-[#EEEEEE] accent-[#0A0A0A] cursor-pointer"
            />
          )}

          <div
            className={`rounded-[10px] bg-[#F8F8F8] border border-[#EEEEEE] flex items-center justify-center shrink-0 text-[#0A0A0A] ${
              isDense ? "h-8 w-8" : isMonitor ? "h-10 w-10" : "h-9 w-9"
            }`}
          >
            <Database className={`${isMonitor ? "w-5 h-5" : "w-4 h-4"} text-[#4D4D4D]`} />
          </div>

          <div className="min-w-0">
            <h3 className={`font-medium text-[#0A0A0A] truncate ${isMonitor ? "text-base" : "text-sm"}`}>
              {database.name}
            </h3>
            <p className="text-xs text-[#737373] truncate mt-0.5">
              {database.type === "mysql" ? "MySQL" : "PostgreSQL"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={database.status === "enabled"}
            onCheckedChange={() => toggleStatus(database)}
          />
        </div>
      </div>

      {/* Body: Connection details */}
      <div
        className={`flex-1 ${
          isDense ? "px-4 py-3 space-y-2.5" : isMonitor ? "px-6 py-5 space-y-4" : "px-5 py-4 space-y-3.5"
        }`}
      >
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={database.status === "enabled" ? "accent" : "default"}
            className="text-xs"
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${database.status === "enabled" ? "bg-[#22C55E]" : "bg-[#999999]"}`} />
            {database.status}
          </Badge>
          {database.environment && (
            <Badge variant="outline" className="text-xs border-[#EEEEEE]">
              {database.environment}
            </Badge>
          )}
          {database.ssl && (
            <Badge variant="secondary" className="text-xs">
              SSL
            </Badge>
          )}
        </div>

        {/* Connection string */}
        <div className="space-y-1">
          <p className="text-xs text-[#737373]">Endpoint</p>
          <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[#EEEEEE] bg-[#FAFAFA] px-3 py-2">
            <code className="text-xs font-mono text-[#0A0A0A] truncate">
              {database.databaseName
                ? `${database.host}:${database.port}/${database.databaseName}`
                : `${database.host}:${database.port}`}
            </code>
            <button
              onClick={handleCopyHost}
              title="Copy connection string"
              className="p-1 text-[#737373] hover:text-[#0A0A0A] transition-colors shrink-0 cursor-pointer"
            >
              {copiedHost ? (
                <Check className="w-3.5 h-3.5 text-[#22C55E]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Service metadata */}
        {database.serviceName && (
          <div className="space-y-1">
            <p className="text-xs text-[#737373]">Service</p>
            <p className="text-sm text-[#4D4D4D]">{database.serviceName}</p>
          </div>
        )}

        {/* Test result banner */}
        {testResult && (
          <div
            className={`mt-2 px-3 py-2 rounded-[8px] text-xs ${
              testResult.success
                ? "bg-[#22C55E]/10 text-[#15803D] border border-[#22C55E]/20"
                : "bg-[#D64545]/10 text-[#D64545] border border-[#D64545]/20"
            }`}
          >
            <div className="flex items-start gap-2">
              {testResult.success ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E] shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-[#D64545] shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <p className="font-medium">{testResult.message}</p>
                {!testResult.success && testResult.hint && (
                  <p className="text-[11px] opacity-80 leading-relaxed">{testResult.hint}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer: Action buttons */}
      <div
        className={`border-t border-[#EEEEEE] bg-white flex items-center justify-between gap-2 ${
          isDense ? "px-4 py-2.5" : isMonitor ? "px-6 py-3.5" : "px-5 py-3"
        }`}
      >
        <Button
          variant="default"
          size="sm"
          onClick={() => onOpenDetails(database)}
          title="Open Workbench"
          className="flex-1 font-normal"
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
            className="border-[#EEEEEE]"
          >
            {isTesting ? "Testing..." : "Test"}
          </Button>

          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => navigate(`/${database.id}/edit`)}
            title="Edit Connection"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="destructive"
            size="icon-sm"
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
