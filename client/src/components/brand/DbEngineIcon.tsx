import React from "react";

export interface DbEngineIconProps {
  type: string;
  className?: string;
}

// Database icon registry - easy to extend for new database types
const DB_ICONS = {
  postgresql: { src: "/postgre.png", label: "PostgreSQL" },
  mysql: { src: "/mysql.png", label: "MySQL" },
  sqlite: { src: "/sqlite.webp", label: "SQLite" },
} as const;

export function DbEngineIcon({ type, className = "w-4 h-4" }: DbEngineIconProps) {
  const normalized = type?.toLowerCase() ?? "postgresql";
  const iconConfig = DB_ICONS[normalized as keyof typeof DB_ICONS];

  if (!iconConfig) {
    // Fallback to PostgreSQL if unknown type
    return (
      <img
        src={DB_ICONS.postgresql.src}
        alt="Database"
        title={`Unknown database type: ${type}`}
        className={`inline-block object-contain ${className}`}
      />
    );
  }

  return (
    <img
      src={iconConfig.src}
      alt={iconConfig.label}
      title={iconConfig.label}
      className={`inline-block object-contain ${className}`}
    />
  );
}
