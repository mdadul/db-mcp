import { z } from "zod";

export const dailyStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  source: z.enum(["mcp", "agent", "app", "all"]).default("all"),
});
