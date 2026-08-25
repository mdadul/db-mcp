import { db } from "../../db/client.ts";
import { databaseConnections } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import { getExecutor } from "../../services/connPool.ts";

export async function getTableSchema(
  databaseId: string,
  tableName: string
): Promise<string> {
  const [conn] = await db
    .select()
    .from(databaseConnections)
    .where(eq(databaseConnections.id, databaseId));

  if (!conn) return JSON.stringify({ error: `Database "${databaseId}" not found.`, hint: "Call list_databases to get valid database_id values." });
  if (conn.status !== "enabled") return JSON.stringify({ error: `Database "${conn.name}" is disabled.`, hint: "Enable the database in the dashboard before querying." });

  const executor = await getExecutor(conn.id, conn as any);

  interface ColumnRow {
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    character_maximum_length: number | null;
  }

  interface IndexRow {
    index_name: string;
    column_name: string;
    is_unique: boolean;
    is_primary: boolean;
  }

  interface ForeignKeyRow {
    column_name: string;
    foreign_table: string;
    foreign_column: string;
  }

  let columns: ColumnRow[] = [];
  let indexes: IndexRow[] = [];
  let foreignKeys: ForeignKeyRow[] = [];

  try {
    switch (conn.type) {
      case "sqlite": {
        // PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
        const pragmaColumns = await executor.query<any>(`PRAGMA table_info(${JSON.stringify(tableName)})`);
        const pragmaFk = await executor.query<any>(`PRAGMA foreign_key_list(${JSON.stringify(tableName)})`);
        const pragmaIdx = await executor.query<any>(`PRAGMA index_list(${JSON.stringify(tableName)})`);

        columns = pragmaColumns.map((c: any) => ({
          column_name: c.name,
          data_type: c.type || "TEXT",
          is_nullable: c.notnull ? "NO" : "YES",
          column_default: c.dflt_value ?? null,
          character_maximum_length: null,
        }));
        indexes = pragmaIdx.map((i: any) => ({
          index_name: i.name,
          column_name: "",
          is_unique: Boolean(i.unique),
          is_primary: i.origin === "pk",
        }));
        foreignKeys = pragmaFk.map((fk: any) => ({
          column_name: fk.from,
          foreign_table: fk.table,
          foreign_column: fk.to,
        }));
        break;
      }
      case "redshift": {
        // PG_TABLE_DEF's CASE WHEN on the notnull column errors on Redshift; use information_schema instead.
        // Sort/dist keys still come from SVV_TABLE_INFO, which has no such issue.
        const [redshiftCols, redshiftMeta] = await Promise.all([
          executor.query<ColumnRow>(
            `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
             FROM information_schema.columns
             WHERE table_name = $1
             ORDER BY ordinal_position`,
            [tableName]
          ),
          executor.query<any>(
            `SELECT sortkey1, sortkey1_enc, diststyle, distkey FROM SVV_TABLE_INFO WHERE "table" = $1`,
            [tableName]
          ),
        ]);
        columns = redshiftCols;
        const meta = redshiftMeta[0] ?? {};
        // Surface sort key and dist key in the indexes field
        if (meta.sortkey1) {
          indexes.push({ index_name: `sort_key:${meta.sortkey1}`, column_name: meta.sortkey1, is_unique: false, is_primary: false });
        }
        if (meta.distkey) {
          indexes.push({ index_name: `dist_key:${meta.distkey}`, column_name: meta.distkey, is_unique: false, is_primary: false });
        }
        break;
      }
      case "mysql":
        [columns, indexes, foreignKeys] = await Promise.all([
          executor.query<ColumnRow>(
            `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
             FROM information_schema.columns
             WHERE table_schema = ? AND table_name = ?
             ORDER BY ordinal_position`,
            [conn.databaseName, tableName]
          ),
          executor.query<IndexRow>(
            `SELECT index_name, column_name, (non_unique = 0) as is_unique, (index_name = 'PRIMARY') as is_primary
             FROM information_schema.statistics
             WHERE table_schema = ? AND table_name = ?`,
            [conn.databaseName, tableName]
          ),
          executor.query<ForeignKeyRow>(
            `SELECT column_name, referenced_table_name as foreign_table, referenced_column_name as foreign_column
             FROM information_schema.key_column_usage
             WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL`,
            [conn.databaseName, tableName]
          ),
        ]);
        break;
      case "mongodb": {
        // No fixed schema — infer field names/types from a sample of recent documents
        const sample = await executor.query<Record<string, unknown>>(
          JSON.stringify({ op: "sample", collection: tableName, limit: 50 })
        );
        const fieldTypes = new Map<string, Set<string>>();
        for (const doc of sample) {
          for (const [key, value] of Object.entries(doc)) {
            const bsonType = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "object" ? "object" : typeof value;
            if (!fieldTypes.has(key)) fieldTypes.set(key, new Set());
            fieldTypes.get(key)!.add(bsonType);
          }
        }
        columns = Array.from(fieldTypes.entries()).map(([column_name, types]) => ({
          column_name,
          data_type: Array.from(types).join(" | "),
          is_nullable: types.has("null") ? "YES" : "UNKNOWN",
          column_default: null,
          character_maximum_length: null,
        }));

        const mongoIndexes = await executor.query<any>(
          JSON.stringify({ op: "listIndexes", collection: tableName })
        );
        indexes = mongoIndexes.map((idx: any) => ({
          index_name: idx.index_name,
          column_name: idx.column_name,
          is_unique: Boolean(idx.is_unique),
          is_primary: Boolean(idx.is_primary),
        }));
        // MongoDB has no foreign key constraints
        foreignKeys = [];
        break;
      }
      default:
        [columns, indexes, foreignKeys] = await Promise.all([
          executor.query<ColumnRow>(
            `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
             FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1
             ORDER BY ordinal_position`,
            [tableName]
          ),
          executor.query<IndexRow>(
            `SELECT i.relname AS index_name, a.attname AS column_name,
                    ix.indisunique AS is_unique, ix.indisprimary AS is_primary
             FROM pg_class t
             JOIN pg_index     ix ON t.oid = ix.indrelid
             JOIN pg_class     i  ON i.oid = ix.indexrelid
             JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
             WHERE t.relname = $1 AND t.relkind = 'r'
             ORDER BY i.relname, a.attnum`,
            [tableName]
          ),
          executor.query<ForeignKeyRow>(
            `SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
             FROM information_schema.table_constraints        tc
             JOIN information_schema.key_column_usage         kcu
               ON tc.constraint_name = kcu.constraint_name
             JOIN information_schema.constraint_column_usage  ccu
               ON tc.constraint_name = ccu.constraint_name
             WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1`,
            [tableName]
          ),
        ]);
    }
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const cleanMsg = rawMsg.replace(/password=['"][^'"]*['"]/gi, "password=***");
    return JSON.stringify({ error: cleanMsg, database: conn.name, table: tableName, columns: [], indexes: [], foreignKeys: [] });
  }

  if (columns.length === 0 && conn.type !== "mongodb") {
    return JSON.stringify({ error: `Table "${tableName}" not found in database "${conn.name}".`, hint: "Call get_database_schema to list available table names." });
  }

  return JSON.stringify(
    {
      database: conn.name,
      type: conn.type,
      table: tableName,
      columns,
      indexes,
      foreignKeys,
      hint:
        conn.type === "mongodb" && columns.length === 0
          ? "This collection is empty (or the field sample was too small to infer any columns). Confirm the collection name via get_database_schema."
          : "Use execute_read_query to query this table.",
    }
  );
}
