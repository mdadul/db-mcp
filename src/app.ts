import { Hono, type ErrorHandler } from "hono";

import { activityRoutes } from "./api/routes/activity/index.ts";
import { databaseRoutes } from "./api/routes/databases/index.ts";
import { healthRoutes } from "./api/routes/health/index.ts";
import { statsRoutes } from "./api/routes/stats/index.ts";
import { AppError } from "./errors.ts";

/** Maps AppError to its status code and everything else to a generic 500. */
export const handleAppError: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, ...(err.hint ? { hint: err.hint } : {}) }, err.statusCode);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
};

/**
 * The Hono app containing all RPC-accessible API routes.
 * Side-effect free — safe for the client to import `AppType` from this module.
 *
 * The /mcp route and request guards are added in src/index.ts (server-only).
 */
export const app = new Hono()
  .route("/api", healthRoutes)
  .route("/api/databases", databaseRoutes)
  .route("/api/stats", statsRoutes)
  .route("/api/activity", activityRoutes);

app.onError(handleAppError);

export type AppType = typeof app;
