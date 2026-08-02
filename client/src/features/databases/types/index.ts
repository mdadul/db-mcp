export type {
  DatabaseConnection,
  TestResult,
  CreateDatabaseInput,
  UpdateDatabaseInput,
  SetStatusInput,
  StructuredQueryResult,
  QueryLogItem,
} from "@server/api/routes/databases/types.ts";

// ---------------------------------------------------------------------------
// Engine registry — add new engines here to extend the picker and form logic.
// The `type` must match the backend DbConfig.type union.
// ---------------------------------------------------------------------------
export type DbEngineType = "postgresql" | "mysql" | "sqlite" | "redshift";

export interface DbEngineConfig {
  type: DbEngineType;
  label: string;
  badge: string;       // shown in the picker card (port or "File")
  hint: string;        // examples shown below the label
  defaultPort: number; // 0 = file-based, no port
  requiresNetwork: boolean; // false = SQLite-style file path only
  sslRequired: boolean;    // true = SSL forced regardless of toggle
}

export const DB_ENGINES: DbEngineConfig[] = [
  {
    type: "postgresql",
    label: "PostgreSQL",
    badge: "5432",
    hint: "Supabase, Neon, AWS RDS, CockroachDB",
    defaultPort: 5432,
    requiresNetwork: true,
    sslRequired: false,
  },
  {
    type: "mysql",
    label: "MySQL",
    badge: "3306",
    hint: "PlanetScale, AWS RDS, MariaDB",
    defaultPort: 3306,
    requiresNetwork: true,
    sslRequired: false,
  },
  {
    type: "sqlite",
    label: "SQLite",
    badge: "File",
    hint: "Local file, Turso, libSQL",
    defaultPort: 0,
    requiresNetwork: false,
    sslRequired: false,
  },
  {
    type: "redshift",
    label: "Amazon Redshift",
    badge: "5439",
    hint: "AWS data warehouse",
    defaultPort: 5439,
    requiresNetwork: true,
    sslRequired: true,
  },
];

export interface DatabaseTestResultState {
  id: string;
  success: boolean;
  message: string;
  hint?: string;
  latencyMs?: number;
}

export interface TableMeta {
  table_name: string;
  table_type: string;
}

export interface ColumnMeta {
  column_name: string;
  data_type?: string;
  is_nullable?: string;
}

export interface IndexMeta {
  index_name: string;
}

export interface ForeignKeyMeta {
  column_name: string;
  foreign_table: string;
  foreign_column: string;
}

export interface TableSchema {
  columns: ColumnMeta[];
  indexes: IndexMeta[];
  foreignKeys: ForeignKeyMeta[];
}

export interface SchemaResponse {
  tables: (string | { table_name?: string; TABLE_NAME?: string; table_type?: string; TABLE_TYPE?: string })[];
  message?: string;
  error?: string;
}

