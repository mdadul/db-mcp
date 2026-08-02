import type { ParsedConnectionFields } from "./ConnectionStringParser";
import { DbEngineIcon } from "@/components/brand/DbEngineIcon";
import { Badge } from "@/components/ui/Badge";
import { Sparkles } from "@/components/ui/Icons";

export interface PresetSelectorProps {
  onSelectPreset: (fields: ParsedConnectionFields) => void;
  className?: string;
}

const PRESETS = [
  {
    name: "Local PostgreSQL",
    badge: "5432",
    engine: "postgresql" as const,
    fields: {
      type: "postgresql" as const,
      host: "localhost",
      port: 5432,
      databaseName: "postgres",
      username: "postgres",
      password: "postgres",
      ssl: false,
    },
  },
  {
    name: "Local MySQL",
    badge: "3306",
    engine: "mysql" as const,
    fields: {
      type: "mysql" as const,
      host: "localhost",
      port: 3306,
      databaseName: "app_db",
      username: "root",
      password: "root",
      ssl: false,
    },
  },
  {
    name: "Docker Compose",
    badge: "Docker",
    engine: "postgresql" as const,
    fields: {
      type: "postgresql" as const,
      host: "postgres",
      port: 5432,
      databaseName: "postgres",
      username: "postgres",
      password: "postgres",
      ssl: false,
    },
  },
  {
    name: "Neon Tech",
    badge: "Cloud",
    engine: "postgresql" as const,
    fields: {
      type: "postgresql" as const,
      host: "ep-cool-db-123456.us-east-2.aws.neon.tech",
      port: 5432,
      databaseName: "neondb",
      username: "neondb_owner",
      ssl: true,
    },
  },
  {
    name: "Supabase Pooler",
    badge: "6543",
    engine: "postgresql" as const,
    fields: {
      type: "postgresql" as const,
      host: "aws-0-us-east-1.pooler.supabase.com",
      port: 6543,
      databaseName: "postgres",
      username: "postgres.myproject",
      ssl: true,
    },
  },
  {
    name: "PlanetScale",
    badge: "SSL",
    engine: "mysql" as const,
    fields: {
      type: "mysql" as const,
      host: "aws.connect.psdb.cloud",
      port: 3306,
      databaseName: "main",
      username: "planetscale_user",
      ssl: true,
    },
  },
];

export function PresetSelector({ onSelectPreset, className = "" }: PresetSelectorProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-primary" />
          <span>Quick Presets</span>
        </span>
        <span className="text-[11px] text-muted-foreground">Click to populate sample defaults</span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => onSelectPreset(p.fields)}
            className="group inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-card text-foreground border border-border/80 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all shrink-0 shadow-2xs hover:shadow-xs active:scale-[0.98] cursor-pointer"
          >
            <DbEngineIcon type={p.engine} className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
            <span>{p.name}</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-muted/50 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary transition-colors">
              {p.badge}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

