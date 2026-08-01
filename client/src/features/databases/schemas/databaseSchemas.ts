import { z } from "zod";

export const baseDatabaseFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255, "Name is too long"),
  type: z.enum(["postgresql", "mysql"]),
  host: z.string().trim().min(1, "Host is required"),
  port: z
    .union([z.string(), z.number()])
    .transform((val) => Number(val))
    .pipe(
      z
        .number({ invalid_type_error: "Port must be a number" })
        .int("Port must be an integer")
        .min(1, "Port must be between 1 and 65535")
        .max(65535, "Port must be between 1 and 65535")
    ),
  databaseName: z.string().trim().min(1, "Database name is required"),
  username: z.string().trim().min(1, "Username is required"),
  ssl: z.boolean().default(false),
  serviceName: z.string().trim().optional(),
  environment: z.string().trim().optional(),
});

export const createDatabaseFormSchema = baseDatabaseFormSchema.extend({
  password: z.string().min(1, "Password is required"),
});

export const updateDatabaseFormSchema = baseDatabaseFormSchema.extend({
  password: z.string().optional(),
});

export type BaseDatabaseFormData = z.input<typeof baseDatabaseFormSchema>;
export type CreateDatabaseFormData = z.infer<typeof createDatabaseFormSchema>;
export type UpdateDatabaseFormData = z.infer<typeof updateDatabaseFormSchema>;
