import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "./app.ts";
import { mcpAuth } from "./api/middleware/mcpAuth.ts";
import { handleMcpRequest } from "./mcp/server.ts";
import { runMigrations } from "./db/runMigrations.ts";

// Run migrations before accepting traffic
await runMigrations();

const CLIENT_ROOT = join(import.meta.dirname, "..", "client", "dist");

// ── MCP endpoint (bearer-token protected, not part of the RPC type) ──────────
app.all("/mcp", mcpAuth, async (c) => handleMcpRequest(c.req.raw));

// ── Static file serving (production) ─────────────────────────────────────────
// serveStatic calls next() when a file isn't found, so SPA routes fall through.
app.use("/*", serveStatic({ root: CLIENT_ROOT }));

const INDEX_HTML = join(CLIENT_ROOT, "index.html");

app.get("/*", (c) => {
  if (existsSync(INDEX_HTML)) {
    return c.html(readFileSync(INDEX_HTML, "utf-8"));
  }
  return c.text(
    "Client not built. Run: cd client && bun install && bun run build",
    404
  );
});

const port = Number(process.env.PORT ?? 4080);
// Loopback by default so a laptop install never exposes the gateway; Docker sets HOST=0.0.0.0.
const hostname = process.env.HOST ?? "127.0.0.1";

// Handle unhandled rejections
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
  process.exit(1);
});

const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.error(`db-mcp gateway running on http://${hostname}:${info.port}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use — is db-mcp already running?`);
    console.error("Stop the other instance, or set PORT=<other-port> to use a different one.");
  } else {
    console.error("Failed to start db-mcp gateway:", error);
  }
  process.exit(1);
});
