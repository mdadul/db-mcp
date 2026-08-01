import { executeReadQuery as execQuery } from "../../api/routes/databases/service.ts";

export async function executeReadQuery(
  databaseId: string,
  query: string,
  limit?: number
): Promise<string> {
  return execQuery(databaseId, query, limit);
}
