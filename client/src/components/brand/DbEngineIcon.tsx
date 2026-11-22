import React from "react";

export interface DbEngineIconProps {
  type: string;
  className?: string;
}

// Local SVG marks keep 16px engine icons crisp without runtime network requests.
const DB_ICONS = {
  postgresql: { src: "/engines/postgresql.svg", label: "PostgreSQL" },
  mysql: { src: "/engines/mysql.svg", label: "MySQL" },
  sqlite: { src: "/engines/sqlite.svg", label: "SQLite" },
  redshift: { src: "/engines/redshift.svg", label: "Amazon Redshift" },
  mongodb: { src: "/engines/mongodb.svg", label: "MongoDB" },
} as const;

const FALLBACK_ICON = { src: "/engines/database.svg", label: "Database" };

export function DbEngineIcon({ type, className = "w-4 h-4" }: DbEngineIconProps) {
  const normalized = type?.toLowerCase() ?? "";
  const hasIcon = Object.hasOwn(DB_ICONS, normalized);
  const iconConfig = hasIcon ? DB_ICONS[normalized as keyof typeof DB_ICONS] : FALLBACK_ICON;

  return (
    <img
      src={iconConfig.src}
      alt={iconConfig.label}
      title={hasIcon ? iconConfig.label : `Unknown database type: ${type}`}
      width={16}
      height={16}
      draggable={false}
      className={`inline-block shrink-0 object-contain ${className}`}
    />
  );
}
