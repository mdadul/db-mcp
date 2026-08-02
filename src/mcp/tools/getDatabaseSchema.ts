import { db } from "../../db/client.ts";
import { databaseConnections } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import { getExecutor } from "../../services/connPool.ts";

export async function getDatabaseSchema(databaseId: string, filter?: string): Promise<string> {
  const [conn] = await db
    .select()
    .from(databaseConnections)
    .where(eq(databaseConnections.id, databaseId));

  if (!conn) return JSON.stringify({ error: `Database "${databaseId}" not found.`, hint: "Call list_databases to get valid database_id values." });
  if (conn.status !== "enabled") return JSON.stringify({ error: `Database "${conn.name}" is disabled.`, hint: "Enable the database in the dashboard before querying." });

  const executor = await getExecutor(conn.id, conn as any);

  interface TableRow {
    table_name?: string | null;
    TABLE_NAME?: string | null;
    table_type?: string | null;
    TABLE_TYPE?: string | null;
  }

  let tables: TableRow[] = [];

  try {
    switch (conn.type) {
      case "sqlite":
        tables = await executor.query<TableRow>(
          `SELECT name AS table_name, type AS table_type FROM sqlite_master WHERE type='table' ORDER BY name`
        );
        break;
      case "redshift":
        tables = await executor.query<TableRow>(
          `SELECT schema || '.' || "table" AS table_name, 'BASE TABLE' AS table_type
           FROM SVV_TABLE_INFO
           ORDER BY schema, "table"`
        );
        break;
      case "mysql":
        tables = await executor.query<TableRow>(
          `SELECT table_name, table_type 
           FROM information_schema.tables 
           WHERE table_schema = ? 
           ORDER BY table_name`,
          [conn.databaseName]
        );
        break;
      case "postgresql":
      default:
        tables = await executor.query<TableRow>(
          `SELECT table_name, table_type
           FROM information_schema.tables
           WHERE table_schema = 'public'
           ORDER BY table_name`
        );
    }
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const cleanMsg = rawMsg.replace(/password=['"][^'"]*['"]/gi, "password=***");
    return JSON.stringify({ error: cleanMsg, database: conn.name, type: conn.type, tables: [] });
  }

  const normalizedTables = tables
    .map((t) => {
      const tableName = t?.table_name ?? t?.TABLE_NAME ?? null;
      const tableType = t?.table_type ?? t?.TABLE_TYPE ?? null;
      return {
        table_name: tableName,
        table_type: tableType,
      };
    })
    .filter((t) => typeof t.table_name === "string" && t.table_name.length > 0) as {
    table_name: string;
    table_type: string | null;
  }[];

  const visibleTables = filter
    ? normalizedTables.filter((t) =>
        t.table_name.toLowerCase().includes(filter.toLowerCase())
      )
    : normalizedTables;

  if (visibleTables.length === 0) {
    return JSON.stringify({
      database: conn.name,
      type: conn.type,
      tables: [],
      hint: filter
        ? `No tables matching "${filter}". Try a broader filter or omit it to list all tables.`
        : `No tables found in database "${conn.name}".`,
    });
  }

  return JSON.stringify({
    database: conn.name,
    type: conn.type,
    table_count: visibleTables.length,
    tables: visibleTables,
    table_names: visibleTables.map((t) => t.table_name),
    hint: "Use get_table_schema to inspect columns, indexes, and foreign keys for a specific table.",
  });
}
