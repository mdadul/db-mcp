import { z } from "zod";

const isoDate = z.string().trim().min(1).max(40).refine((value) => !Number.isNaN(Date.parse(value)), "Use an ISO 8601 date").optional();

export const activityFilterSchema = z.object({
  databaseId: z.string().min(1).max(128).optional(),
  status: z.enum(["success", "error", "timeout", "blocked"]).optional(),
  tool: z.string().trim().min(1).max(128).optional(),
  source: z.enum(["mcp", "app"]).optional(),
  from: isoDate,
  to: isoDate,
});

export const activityQuerySchema = activityFilterSchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const activityExportSchema = activityFilterSchema.extend({
  format: z.enum(["csv", "json"]).default("csv"),
});

export type ActivityFilters = z.infer<typeof activityFilterSchema>;
