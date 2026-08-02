import postgres from "postgres";
import mysql from "mysql2/promise";
import BetterSqlite3 from "better-sqlite3";
import { decrypt } from "./credentials.ts";
import type { EncryptedPayload } from "./credentials.ts";

export interface DbConfig {
  type: "postgresql" | "mysql" | "sqlite";
  host: string;
  port: number;
  databaseName: string;
  username: string;
  encryptedCredentials: string;
  ssl: boolean;
}

export interface DbExecutor {
  type: "postgresql" | "mysql" | "sqlite";
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
        ssl: config.ssl ? "require" : false,
        max: 3,
        connect_timeout: 10,
        idle_timeout: 60,
      });
      return {
        type: "postgresql",
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
