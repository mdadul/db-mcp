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

// ── MCP endpoint (bearer-token protected, not part of the RPC type) ──────────
app.all("/mcp", mcpAuth, async (c) => handleMcpRequest(c.req.raw));

// ── Static file serving (production) ─────────────────────────────────────────
// serveStatic calls next() when a file isn't found, so SPA routes fall through.
app.use("/*", serveStatic({ root: "./client/dist" }));

const INDEX_HTML = join(process.cwd(), "client", "dist", "index.html");

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
console.error(`db-mcp gateway running on http://localhost:${port}`);

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
});

serve({ fetch: app.fetch, port });
