import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Zap, ClipboardPaste, Check, Sparkles, AlertTriangle } from "@/components/ui/Icons";

import type { DbEngineType } from "../types";

export interface ParsedConnectionFields {
  type?: DbEngineType;
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
      const protocol = cleanUri.slice(0, cleanUri.indexOf(":")).toLowerCase();
      const type: DbEngineType =
        protocol === "mysql"
          ? "mysql"
          : protocol === "mongodb" || protocol === "mongodb+srv"
            ? "mongodb"
            : protocol === "redshift"
              ? "redshift"
              : protocol === "sqlite"
                ? "sqlite"
                : "postgresql";
      if (type === "sqlite") {
        const path = cleanUri.slice(cleanUri.indexOf(":") + 1).replace(/^\/\//, "");
        return { type, databaseName: decodeURIComponent(path) };
      }
      if (
        !["postgres", "postgresql", "mysql", "mongodb", "mongodb+srv", "redshift"].includes(
          protocol,
        )
      )
        return null;
      if (protocol === "postgres")
        cleanUri = `postgresql://${cleanUri.slice(cleanUri.indexOf(":") + 1).replace(/^\/\//, "")}`;

      const parsed = new URL(cleanUri);
      const defaults: Record<DbEngineType, number> = {
        postgresql: 5432,
        mysql: 3306,
        sqlite: 0,
        redshift: 5439,
        mongodb: 27017,
      };
      const host = parsed.hostname || "localhost";
      const port = parsed.port ? parseInt(parsed.port, 10) : defaults[type];
      const databaseName = parsed.pathname
        ? decodeURIComponent(parsed.pathname.replace(/^\//, ""))
        : "";
      const username = decodeURIComponent(parsed.username || "");
      const password = decodeURIComponent(parsed.password || "");

      const sslParam =
        parsed.searchParams.get("ssl") ||
        parsed.searchParams.get("sslmode") ||
        parsed.searchParams.get("tls");
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
      setError("Use a PostgreSQL, MySQL, Redshift, MongoDB, or SQLite connection URL.");
      return;
    }

    onParse(fields);
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
    <div
      className={`rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 via-background to-accent/30 p-4 sm:p-5 shadow-xs ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-xs">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="text-scale-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <span>Quick URI Import</span>
              <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
            </h4>
            <p className="text-scale-xs text-muted-foreground mt-0.5">
              Paste a database URI string to auto-fill form fields
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePasteClipboard}
          className="text-scale-xs bg-background/80 hover:bg-background border-primary/30 text-primary self-start sm:self-auto gap-1.5 shadow-2xs"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          <span>Paste from Clipboard</span>
        </Button>
      </div>

      <div className="mt-3.5 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="postgresql://user:pass@host:5432/db or mongodb://user:pass@host:27017/db"
              value={uri}
              onChange={(e) => {
                setUri(e.target.value);
                if (error) setError(null);
              }}
              className="w-full px-3.5 py-2 text-scale-xs font-mono border border-primary/30 rounded-lg bg-background/90 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60"
            />
            {copiedSuccess && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ui-sm text-success font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Parsed & Applied!
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleParse}
            disabled={!uri.trim()}
            className="shrink-0 text-scale-xs px-4"
          >
            Auto-Fill
          </Button>
        </div>

        {/* Live Detected Preview Chips */}
        {detectedFields && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 animate-in fade-in slide-in-from-top-1">
            <span className="text-ui-xs font-medium text-muted-foreground mr-1">Detected:</span>
            <Badge
              variant="secondary"
              className="text-ui-xs uppercase font-bold bg-primary/10 text-primary border-primary/20"
            >
              {detectedFields.type}
            </Badge>
            {detectedFields.host && (
              <Badge variant="outline" className="text-ui-xs font-mono bg-background">
                host: {detectedFields.host}
              </Badge>
            )}
            {detectedFields.port && (
              <Badge variant="outline" className="text-ui-xs font-mono bg-background">
                port: {detectedFields.port}
              </Badge>
            )}
            {detectedFields.databaseName && (
              <Badge variant="outline" className="text-ui-xs font-mono bg-background">
                db: {detectedFields.databaseName}
              </Badge>
            )}
            {detectedFields.username && (
              <Badge variant="outline" className="text-ui-xs font-mono bg-background">
                user: {detectedFields.username}
              </Badge>
            )}
            {detectedFields.ssl && (
              <Badge
                variant="outline"
                className="text-ui-xs font-mono bg-success-subtle text-success border-success/30"
              >
                SSL Required
              </Badge>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-scale-xs text-destructive font-medium pt-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
