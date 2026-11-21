import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Server as HttpServer } from "node:http";
import { app, handleAppError } from "./app.ts";
import {
  apiGuard,
  hostGuard,
  mcpOriginGuard,
  parseAllowedOrigins,
} from "./api/middleware/localGuard.ts";
import { closeDb } from "./db/client.ts";
import { runMigrations } from "./db/runMigrations.ts";
import { handleMcpRequest } from "./mcp/server.ts";
import { closeAll } from "./services/connPool.ts";

const SHUTDOWN_TIMEOUT_MS = 5000;

// Run migrations before accepting traffic
await runMigrations();

const port = Number(process.env.PORT ?? 4080);
const hostname = process.env.HOST ?? "127.0.0.1";

// Middleware must be registered before the routes it guards. Hono only runs
// middleware that was added ahead of a matching route, so the guards live on a
// root app that mounts the API app last.
const root = new Hono();
root.use("*", hostGuard(port));
root.use(
  "/api/*",
  apiGuard({
    sessionToken: process.env.APP_SESSION_TOKEN,
    allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  })
);
root.all("/mcp", mcpOriginGuard, (c) => handleMcpRequest(c.req.raw));
root.route("/", app);
// Route errors from /mcp through the same JSON error handler as /api.
root.onError(handleAppError);

const server = serve(
  { fetch: root.fetch, port, hostname },
  (info) => {
    console.error(`db-mcp gateway running on http://${hostname}:${info.port}`);
  }
) as HttpServer;

let shutdownStarted = false;

/** Stops the server and closes DB handles. Runs once, however many signals arrive. */
async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.error(`Shutting down: ${reason}`);

  const forceExit = setTimeout(() => {
    console.error("Shutdown timed out, forcing exit.");
    process.exit(exitCode);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
  });

  await closeAll();
  try {
    closeDb();
  } catch (err) {
    console.error("Failed to close SQLite handle:", err);
  }

  process.exit(exitCode);
}

server.on("error", (err: NodeJS.ErrnoException) => {
  console.error(`Failed to listen on ${hostname}:${port}: ${err.message}`);
  void shutdown(err.code === "EADDRINUSE" ? "port in use" : "listen error", 1);
});

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

// When the desktop shell dies, its end of the stdin pipe closes. Exit with it
// so the sidecar never outlives its parent. Skipped on a TTY so a terminal
// session is not stopped by stdin events.
if (!process.stdin.isTTY) {
  const onParentGone = () => void shutdown("stdin closed (parent process exited)");
  process.stdin.once("end", onParentGone);
  process.stdin.once("close", onParentGone);
  process.stdin.resume();
}

// Handle unhandled rejections
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT EXCEPTION]", error);
});
