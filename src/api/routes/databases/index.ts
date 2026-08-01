import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  CreateDatabaseSchema,
  UpdateDatabaseSchema,
  SetStatusSchema,
  ExecuteQuerySchema,
} from "./types.ts";
import * as service from "./service.ts";

export const databaseRoutes = new Hono()
  // List all databases
  .get("/", async (c) => c.json(await service.listDatabases()))

  // Create a database
  .post(
    "/",
    zValidator("json", CreateDatabaseSchema),
    async (c) => c.json(await service.createDatabase(c.req.valid("json")), 201)
  )

  // Get one database
  .get("/:id", async (c) => c.json(await service.getDatabase(c.req.param("id"))))

  // Update a database
  .patch(
    "/:id",
    zValidator("json", UpdateDatabaseSchema),
    async (c) =>
      c.json(
        await service.updateDatabase(c.req.param("id"), c.req.valid("json"))
      )
  )

  // Delete a database
  .delete("/:id", async (c) => {
    await service.deleteDatabase(c.req.param("id"));
    return c.json({ success: true as const });
  })

  // Test connection
  .post("/:id/test", async (c) =>
    c.json(await service.testConnection(c.req.param("id")))
  )

  // Enable / disable
  .patch(
    "/:id/status",
    zValidator("json", SetStatusSchema),
    async (c) =>
      c.json(
        await service.setStatus(c.req.param("id"), c.req.valid("json").status)
      )
  )

  // Get database schema (tables list)
  .get("/:id/schema", async (c) =>
    c.json(await service.getDatabaseSchemaApi(c.req.param("id")))
  )

  // Get table schema (columns, indexes, foreign keys)
  .get("/:id/tables/:tableName/schema", async (c) =>
    c.json(
      await service.getTableSchemaApi(
        c.req.param("id"),
        c.req.param("tableName")
      )
    )
  )

  // Execute interactive read query (SQL Playground)
  .post(
    "/:id/query",
    zValidator("json", ExecuteQuerySchema),
    async (c) => {
      const { query, limit } = c.req.valid("json");
      return c.json(
        await service.executeQueryStructured(c.req.param("id"), query, limit)
      );
    }
  )

  // Get database query audit logs
  .get(
    "/:id/logs",
    zValidator("query", z.object({ limit: z.string().optional() })),
    async (c) => {
      const { limit: limitParam } = c.req.valid("query");
      const limit = limitParam ? parseInt(limitParam, 10) : 50;
      return c.json(await service.getDatabaseLogs(c.req.param("id"), limit));
    }
  );

