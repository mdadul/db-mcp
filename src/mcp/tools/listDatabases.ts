import { db } from "../../db/client.ts";
import { databaseConnections } from "../../db/schema.ts";
import { eq } from "drizzle-orm";

export async function listDatabases(): Promise<string> {
  const rows = await db
    .select({
      database_id: databaseConnections.id,
      name: databaseConnections.name,
      type: databaseConnections.type,
      database_name: databaseConnections.databaseName,
      environment: databaseConnections.environment,
      service_name: databaseConnections.serviceName,
    })
    .from(databaseConnections)
    .where(eq(databaseConnections.status, "enabled"));

  if (rows.length === 0) {
    return JSON.stringify({
      databases: [],
      hint: "No databases configured. Add one through the web dashboard.",
    });
  }

  return JSON.stringify({
    databases: rows,
    hint: "Use 'database_id' in all other tool calls. Call get_database_schema to list tables, then get_table_schema to inspect columns.",
  });
}
