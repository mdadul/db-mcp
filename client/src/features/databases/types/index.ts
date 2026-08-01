export type {
  DatabaseConnection,
  TestResult,
  CreateDatabaseInput,
  UpdateDatabaseInput,
  SetStatusInput,
  StructuredQueryResult,
  QueryLogItem,
} from "@server/api/routes/databases/types.ts";

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

