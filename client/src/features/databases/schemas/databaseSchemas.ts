import { z } from "zod";
import { DB_ENGINE_TYPES } from "@server/api/routes/databases/types.ts";

const baseDatabaseFormObject = z.object({
  name: z.string().trim().min(1, "Name is required").max(255, "Name is too long"),
  type: z.enum(DB_ENGINE_TYPES),
  host: z.string().trim().optional().default(""),
  port: z
    .union([z.string(), z.number()])
    .transform((val) => Number(val))
    .pipe(z.number().int().min(0).max(65535))
    .optional()
    .default(5432),
  databaseName: z.string().trim().optional().default(""),
  username: z.string().trim().optional().default(""),
  ssl: z.boolean().default(false),
  serviceName: z.string().trim().optional(),
  environment: z.string().trim().optional(),
});

// Exported for form field typing — the ZodObject without refinements
function requireDatabaseFile(data: { type: string; databaseName?: string }, ctx: z.RefinementCtx) {
  if (data.type === "sqlite" && !data.databaseName) {
    ctx.addIssue({ code: "custom", path: ["databaseName"], message: "File path is required" });
  }
}

export const baseDatabaseFormSchema = baseDatabaseFormObject.superRefine((data, ctx) => {
  requireDatabaseFile(data, ctx);
  if (data.type !== "sqlite") {
    if (!data.host) ctx.addIssue({ code: "custom", path: ["host"], message: "Host is required" });
    if (!data.username) ctx.addIssue({ code: "custom", path: ["username"], message: "Username is required" });
  }
});

export const createDatabaseFormSchema = baseDatabaseFormObject
  .extend({ password: z.string().optional() })
  .superRefine((data, ctx) => {
    requireDatabaseFile(data, ctx);
    if (data.type !== "sqlite") {
      if (!data.host) ctx.addIssue({ code: "custom", path: ["host"], message: "Host is required" });
      if (!data.username) ctx.addIssue({ code: "custom", path: ["username"], message: "Username is required" });
      if (!data.password) ctx.addIssue({ code: "custom", path: ["password"], message: "Password is required" });
    }
  });

export const updateDatabaseFormSchema = baseDatabaseFormObject
  .extend({ password: z.string().optional() })
  .superRefine((data, ctx) => {
    requireDatabaseFile(data, ctx);
    if (data.type !== "sqlite") {
      if (!data.host) ctx.addIssue({ code: "custom", path: ["host"], message: "Host is required" });
      if (!data.username) ctx.addIssue({ code: "custom", path: ["username"], message: "Username is required" });
    }
  });

export type BaseDatabaseFormData = z.input<typeof baseDatabaseFormObject>;
export type CreateDatabaseFormData = z.infer<typeof createDatabaseFormSchema>;
export type UpdateDatabaseFormData = z.infer<typeof updateDatabaseFormSchema>;
