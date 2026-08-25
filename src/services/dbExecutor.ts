import postgres from "postgres";
import mysql from "mysql2/promise";
import BetterSqlite3 from "better-sqlite3";
import { MongoClient } from "mongodb";
import { decrypt } from "./credentials.ts";
import type { EncryptedPayload } from "./credentials.ts";
import type { DbEngineType } from "../api/routes/databases/types.ts";

export interface DbConfig {
  type: DbEngineType;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  encryptedCredentials: string;
  ssl: boolean;
}

export interface DbExecutor {
  type: DbEngineType;
  query<T = Record<string, unknown>>(sqlString: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function createExecutor(config: DbConfig): Promise<DbExecutor> {
  switch (config.type) {
    case "sqlite": {
      const sqliteDb = new BetterSqlite3(config.databaseName);
      return {
        type: "sqlite",
        async query<T = Record<string, unknown>>(sqlString: string, params?: unknown[]): Promise<T[]> {
          try {
            const stmt = sqliteDb.prepare(sqlString);
            const rows = params?.length ? stmt.all(...params) : stmt.all();
            return rows as T[];
          } catch (err: any) {
            const code = err?.code ?? "UNKNOWN";
            const msg = err?.message ?? String(err);
            console.error(`[DB] SQLite error [${code}]`);
            throw new Error(`[${code}] ${msg}`);
          }
        },
        async close(): Promise<void> {
          sqliteDb.close();
        },
      };
    }

    case "mysql": {
      const payload: EncryptedPayload = JSON.parse(config.encryptedCredentials);
      const password = await decrypt(payload);
      const pool = mysql.createPool({
        host: config.host,
        port: config.port,
        database: config.databaseName,
        user: config.username,
        password,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        connectionLimit: 3,
        connectTimeout: 10000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        idleTimeout: 60000,
      });
      return {
        type: "mysql",
        async query<T = Record<string, unknown>>(sqlString: string, params?: unknown[]): Promise<T[]> {
          try {
            const [rows] = await pool.query(sqlString, params);
            return Array.isArray(rows) ? (rows as T[]) : ([rows] as unknown as T[]);
          } catch (err: any) {
            const code = err?.code ?? "UNKNOWN";
            const msg = err?.message ?? String(err);
            console.error(`[DB] MySQL error [${code}]`);
            throw new Error(`[${code}] ${msg}`);
          }
        },
        async close(): Promise<void> {
          await pool.end();
        },
      };
    }

    case "mongodb": {
      const payload: EncryptedPayload = JSON.parse(config.encryptedCredentials);
      const password = await decrypt(payload);
      const auth = config.username ? `${encodeURIComponent(config.username)}:${encodeURIComponent(password)}@` : "";
      const uri = `mongodb://${auth}${config.host}:${config.port}/${config.databaseName}${config.ssl ? "?tls=true" : ""}`;
      const client = new MongoClient(uri, { connectTimeoutMS: 10000, serverSelectionTimeoutMS: 10000 });
      await client.connect();
      const mongoDb = client.db(config.databaseName);

      return {
        type: "mongodb",
        // sqlString is a JSON DSL. Public queries (via execute_read_query) are limited to
        // {"collection","filter","projection","sort","limit"} by assertReadOnly in src/query/safety.ts.
        // Internal schema-introspection tools additionally use {"op":"listCollections"|"listIndexes"|"sample"},
        // which is never reachable from user-supplied queries since "op" is not an allowed DSL key.
        async query<T = Record<string, unknown>>(sqlString: string): Promise<T[]> {
          try {
            // testConnection() reuses the generic "SELECT 1" probe across all engines
            if (sqlString.trim().toUpperCase() === "SELECT 1") {
              await mongoDb.command({ ping: 1 });
              return [{ "?column?": 1 } as unknown as T];
            }

            const dsl = JSON.parse(sqlString) as {
              op?: "listCollections" | "listIndexes" | "sample";
              collection?: string;
              filter?: Record<string, unknown>;
              projection?: Record<string, unknown>;
              sort?: Record<string, unknown>;
              limit?: number;
            };

            if (dsl.op === "listCollections") {
              const collections = await mongoDb.listCollections({}, { nameOnly: true }).toArray();
              return collections.map((c) => ({ table_name: c.name, table_type: "collection" })) as unknown as T[];
            }

            if (dsl.op === "listIndexes") {
              const indexes = await mongoDb.collection(dsl.collection!).indexes();
              return indexes.map((idx) => ({
                index_name: idx.name,
                column_name: Object.keys(idx.key).join(", "),
                is_unique: Boolean(idx.unique),
                is_primary: idx.name === "_id_",
              })) as unknown as T[];
            }

            if (dsl.op === "sample") {
              const docs = await mongoDb
                .collection(dsl.collection!)
                .find({})
                .sort({ _id: -1 })
                .limit(dsl.limit ?? 50)
                .toArray();
              return docs.map((doc) => JSON.parse(JSON.stringify(doc))) as T[];
            }

            const cursor = mongoDb
              .collection(dsl.collection!)
              .find(dsl.filter ?? {}, { projection: dsl.projection })
              .limit(dsl.limit ?? 100);
            if (dsl.sort) cursor.sort(dsl.sort as [string, 1 | -1][] | Record<string, 1 | -1>);

            const docs = await cursor.toArray();
            // Stringify ObjectId/Date so results serialise safely as JSON
            return docs.map((doc) => JSON.parse(JSON.stringify(doc))) as T[];
          } catch (err: any) {
            const msg = err?.message ?? String(err);
            console.error(`[DB] MongoDB error`);
            throw new Error(msg);
          }
        },
        async close(): Promise<void> {
          await client.close();
        },
      };
    }

    case "redshift":
    case "postgresql":
    default: {
      const payload: EncryptedPayload = JSON.parse(config.encryptedCredentials);
      const password = await decrypt(payload);
      const sql = postgres({
        host: config.host,
        port: config.port,
        database: config.databaseName,
        username: config.username,
        password,
        // Redshift always requires SSL; PostgreSQL respects the user toggle
        ssl: config.type === "redshift" ? "require" : (config.ssl ? "require" : false),
        // Redshift lacks pg_type.typarray — skip the driver's type introspection query
        fetch_types: config.type !== "redshift",
        max: 3,
        connect_timeout: 10,
        idle_timeout: 60,
      });
      return {
        type: config.type as "postgresql" | "redshift",
        async query<T = Record<string, unknown>>(sqlString: string, params?: unknown[]): Promise<T[]> {
          try {
            if (params && params.length > 0) {
              const result = await sql.unsafe<T[]>(sqlString, params as any[]);
              return Array.from(result);
            }
            const result = await sql.unsafe<T[]>(sqlString);
            return Array.from(result);
          } catch (err: any) {
            const code = err?.code ?? "UNKNOWN";
            const msg = err?.message ?? String(err);
            console.error(`[DB] PostgreSQL error [${code}]`);
            throw new Error(`[${code}] ${msg}`);
          }
        },
        async close(): Promise<void> {
          await sql.end({ timeout: 5 });
        },
      };
    }
  }
}
