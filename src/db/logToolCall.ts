import { db } from "./client.ts";
import { toolCalls } from "./schema.ts";

export function logToolCall(
  tool: string,
  status: "success" | "error" = "success",
  databaseConnectionId?: string
): void {
  db.insert(toolCalls)
    .values({ tool, status, databaseConnectionId: databaseConnectionId ?? null })
    .catch(() => {});
}
