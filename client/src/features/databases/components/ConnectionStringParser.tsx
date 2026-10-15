import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Zap, ClipboardPaste, Check, Sparkles, AlertTriangle } from "@/components/ui/Icons";

export interface ParsedConnectionFields {
  type?: "postgresql" | "mysql";
  host?: string;
  port?: number;
  databaseName?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
}

export interface ConnectionStringParserProps {
  onParse: (fields: ParsedConnectionFields) => void;
  className?: string;
}

export function ConnectionStringParser({ onParse, className = "" }: ConnectionStringParserProps) {
  const [uri, setUri] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  const parseUri = (rawUri: string): ParsedConnectionFields | null => {
    if (!rawUri.trim()) return null;
    try {
      let cleanUri = rawUri.trim();
      let type: "postgresql" | "mysql" = "postgresql";

      if (cleanUri.startsWith("postgres://")) {
        cleanUri = "postgresql://" + cleanUri.slice(11);
      } else if (cleanUri.startsWith("mysql://")) {
        type = "mysql";
      }

      const parsed = new URL(cleanUri);

      if (
        parsed.protocol !== "postgresql:" &&
        parsed.protocol !== "postgres:" &&
        parsed.protocol !== "mysql:"
      ) {
        return null;
      }

      const host = parsed.hostname || "localhost";
      const defaultPort = type === "mysql" ? 3306 : 5432;
      const port = parsed.port ? parseInt(parsed.port, 10) : defaultPort;
      const databaseName = parsed.pathname ? parsed.pathname.replace(/^\//, "") : "";
      const username = decodeURIComponent(parsed.username || "");
      const password = decodeURIComponent(parsed.password || "");

      const sslParam = parsed.searchParams.get("ssl") || parsed.searchParams.get("sslmode");
      const ssl =
        sslParam === "require" ||
        sslParam === "verify-full" ||
        sslParam === "true" ||
        parsed.searchParams.has("ssl");

      return {
        type,
        host,
        port,
        databaseName,
        username,
        password,
        ssl,
      };
    } catch {
      return null;
    }
  };

  const detectedFields = parseUri(uri);

  const handleParse = () => {
    setError(null);
    if (!uri.trim()) {
      setError("Please paste a connection string first.");
      return;
    }

    const fields = parseUri(uri);
    if (!fields) {
      setError("Invalid connection string format. Expected: postgresql://... or mysql://...");
      return;
    }

    onParse(fields);
    setUri("");
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  const handlePasteClipboard = async () => {
    setError(null);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setUri(text.trim());
          const fields = parseUri(text.trim());
          if (fields) {
            onParse(fields);
            setCopiedSuccess(true);
            setTimeout(() => setCopiedSuccess(false), 2000);
          }
        }
      }
    } catch {
      // Fallback if clipboard permission is denied
    }
  };

  return (
    <div className={`rounded-[14px] border border-[#EEEEEE] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-[#F8F8F8] border border-[#EEEEEE] text-[#0A0A0A] flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-[#4D4D4D]" />
          </div>
          <div>
            <h4 className="text-xs font-medium text-[#0A0A0A] flex items-center gap-1.5">
              <span>Quick URI Import</span>
              <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
            </h4>
            <p className="text-xs text-[#737373] mt-0.5">
              Paste a database connection string to automatically populate fields
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePasteClipboard}
          className="text-xs border-[#EEEEEE] text-[#4D4D4D] self-start sm:self-auto gap-1.5"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          <span>Paste Clipboard</span>
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="postgresql://user:pass@host:5432/db  or  mysql://root:pass@127.0.0.1:3306/db"
              value={uri}
              onChange={(e) => {
                setUri(e.target.value);
                if (error) setError(null);
              }}
              className="w-full px-3.5 py-2.5 text-xs font-mono border border-[#EEEEEE] rounded-[10px] bg-[#FAFAFA] text-[#0A0A0A] focus:outline-none focus:bg-white focus:border-[#CCCCCC] transition-colors placeholder:text-[#999999]"
            />
            {copiedSuccess && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#15803D] font-normal flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-[#22C55E]" /> Parsed!
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleParse}
            disabled={!uri.trim()}
            className="shrink-0 text-xs px-4"
          >
            Auto-Fill
          </Button>
        </div>

        {/* Live Detected Preview Chips */}
        {detectedFields && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs text-[#737373] mr-1">Detected:</span>
            <Badge variant="secondary" className="text-xs uppercase">
              {detectedFields.type}
            </Badge>
            {detectedFields.host && (
              <Badge variant="outline" className="text-xs font-mono border-[#EEEEEE]">
                host: {detectedFields.host}
              </Badge>
            )}
            {detectedFields.port && (
              <Badge variant="outline" className="text-xs font-mono border-[#EEEEEE]">
                port: {detectedFields.port}
              </Badge>
            )}
            {detectedFields.databaseName && (
              <Badge variant="outline" className="text-xs font-mono border-[#EEEEEE]">
                db: {detectedFields.databaseName}
              </Badge>
            )}
            {detectedFields.ssl && (
              <Badge variant="accent" className="text-xs font-mono">
                SSL Required
              </Badge>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-[#D64545] pt-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
