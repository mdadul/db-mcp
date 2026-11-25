import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  CreateDatabaseSchema,
  UpdateDatabaseSchema,
  SetStatusSchema,
  ExecuteQuerySchema,
  SchemaQuerySchema,
  TableSchemaQuerySchema,
  BrowseRowsQuerySchema,
  TestConnectionSchema,
  DuplicateDatabaseSchema,
} from "./types.ts";
import * as service from "./service.ts";
import { validationHook } from "../../validation.ts";

export const databaseRoutes = new Hono()
  // List all databases
  .get("/", async (c) => c.json(await service.listDatabases()))

  // Create a database
  .post(
    "/",
    zValidator("json", CreateDatabaseSchema, validationHook),
    async (c) => c.json(await service.createDatabase(c.req.valid("json")), 201)
  )

  // Get one database
  .get("/:id", async (c) => c.json(await service.getDatabase(c.req.param("id"))))

  // Update a database
  .patch(
    "/:id",
    zValidator("json", UpdateDatabaseSchema, validationHook),
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
  .post("/test", zValidator("json", TestConnectionSchema, validationHook), async (c) =>
    c.json(await service.testConnectionInput(c.req.valid("json")))
  )

  // Test saved connection
  .post("/:id/test", async (c) =>
    c.json(await service.testConnection(c.req.param("id")))
  )

  // Duplicate and export a safe connection URL
  .post("/:id/duplicate", zValidator("json", DuplicateDatabaseSchema, validationHook), async (c) =>
    c.json(await service.duplicateDatabase(c.req.param("id"), c.req.valid("json")), 201)
  )
  .get("/:id/connection-string", async (c) =>
    c.json(await service.getConnectionString(c.req.param("id")))
  )

  // Enable / disable
  .patch(
    "/:id/status",
    zValidator("json", SetStatusSchema, validationHook),
    async (c) =>
      c.json(
        await service.setStatus(c.req.param("id"), c.req.valid("json").status)
      )
  )

  // Get database schema (tables list)
  .get("/:id/schema", zValidator("query", SchemaQuerySchema, validationHook), async (c) =>
    c.json(await service.getDatabaseSchemaApi(c.req.param("id"), c.req.valid("query").filter))
  )

  // Get table schema (columns, indexes, foreign keys)
  .get("/:id/tables/:tableName/schema", zValidator("query", TableSchemaQuerySchema, validationHook), async (c) =>
    c.json(
      await service.getTableSchemaApi(
        c.req.param("id"),
        c.req.param("tableName"),
        c.req.valid("query").schema
      )
    )
  )

  .get("/:id/tables/:tableName/rows", zValidator("query", BrowseRowsQuerySchema, validationHook), async (c) =>
    c.json(await service.browseTableRows(c.req.param("id"), c.req.param("tableName"), c.req.valid("query")))
  )

  // Execute interactive read query (SQL Playground)
  .post(
    "/:id/query",
    zValidator("json", ExecuteQuerySchema, validationHook),
    async (c) => {
      const { query, limit } = c.req.valid("json");
      return c.json(
        await service.executeQueryStructured(c.req.param("id"), query, limit, "app")
      );
    }
  )

  // Get database query audit logs
  .get(
    "/:id/logs",
    zValidator("query", z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }), validationHook),
    async (c) => {
      const { limit } = c.req.valid("query");
      return c.json(await service.getDatabaseLogs(c.req.param("id"), limit));
    }
  );
