import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Applies all pending Drizzle migrations to the control-plane database.
 * Uses a dedicated single-connection client so it doesn't interfere with the
 * application pool.
 */
export async function runMigrations(): Promise<void> {
  const path = process.env.DATABASE_PATH ?? "./data/db-mcp.sqlite";
  mkdirSync(dirname(path), { recursive: true });

  const client = new Database(path);
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  try {
    console.error("Running database migrations…");
    migrate(drizzle(client), {
      migrationsFolder: join(import.meta.dirname, "migrations"),
    });
    console.error("Migrations complete.");
  } finally {
    client.close();
  }
}
