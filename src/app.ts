import { Hono } from "hono";
import { healthRoutes } from "./api/routes/health/index.ts";
import { databaseRoutes } from "./api/routes/databases/index.ts";
import { statsRoutes } from "./api/routes/stats/index.ts";
import { AppError } from "./errors.ts";

/**
 * The Hono app containing all RPC-accessible API routes.
 * Side-effect free — safe for the client to import `AppType` from this module.
 *
 * MCP and static-file routes are added in src/index.ts (server-only).
 */
export const app = new Hono()
  .route("/api", healthRoutes)
  .route("/api/databases", databaseRoutes)
  .route("/api/stats", statsRoutes);

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message }, err.statusCode);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export type AppType = typeof app;
