import { z } from "zod";

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  databaseId: z.string().min(1).max(128).optional(),
  status: z.enum(["success", "error", "timeout", "blocked"]).optional(),
  tool: z.string().trim().min(1).max(128).optional(),
  source: z.enum(["mcp", "app"]).optional(),
});
