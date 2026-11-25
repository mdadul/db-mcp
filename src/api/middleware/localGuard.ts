import { timingSafeEqual } from "node:crypto";

import type { Context, MiddlewareHandler, Next } from "hono";

/** Origins the Tauri desktop shell serves the bundled UI from. */
export const BUILTIN_ALLOWED_ORIGINS: readonly string[] = [
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
];

const API_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const API_HEADERS = "Content-Type, X-App-Session";
const SESSION_HEADER = "x-app-session";
const HEALTH_PATH = "/api/health";

/** Parses the comma-separated ALLOWED_ORIGINS env value. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * DNS-rebinding protection. Only requests addressed to the loopback host on
 * this server's port are served.
 */
export function hostGuard(port: number): MiddlewareHandler {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);

  return async (c: Context, next: Next) => {
    const host = c.req.header("host") ?? "";
    if (!allowedHosts.has(host)) {
      return c.json(
        {
          error: "Host header is not allowed",
          hint: `Connect to http://127.0.0.1:${port} (or localhost:${port}). Requests addressed to other hostnames are rejected to prevent DNS rebinding.`,
        },
        403,
      );
    }
    await next();
  };
}

/**
 * /mcp accepts only non-browser clients. MCP clients (Claude Desktop, Cursor,
 * Claude Code, ...) send no Origin header, so any Origin means a browser page.
 */
export const mcpOriginGuard: MiddlewareHandler = async (c, next) => {
  if (c.req.header("origin") !== undefined) {
    return c.json(
      {
        error: "Browser-origin requests to /mcp are not allowed",
        hint: "MCP clients do not send an Origin header. Call /mcp from an MCP client (e.g. Claude Code, Cursor) instead of from a web page.",
      },
      403,
    );
  }
  await next();
};

export interface ApiGuardOptions {
  /** Value of APP_SESSION_TOKEN. When empty/unset the session check is skipped. */
  sessionToken?: string | undefined;
  /** Extra origins on top of BUILTIN_ALLOWED_ORIGINS (from ALLOWED_ORIGINS). */
  allowedOrigins?: readonly string[];
}

/**
 * Guards /api:
 * - Origin must be absent or allowlisted. Allowed origins get CORS headers.
 * - OPTIONS preflight is answered with 204.
 * - When a session token is configured, every request except GET /api/health
 *   must send it in X-App-Session.
 *
 * Mount with `root.use("/api/*", apiGuard(...))` before the routes it protects.
 */
export function apiGuard(options: ApiGuardOptions = {}): MiddlewareHandler {
  const allowedOrigins = new Set([...BUILTIN_ALLOWED_ORIGINS, ...(options.allowedOrigins ?? [])]);
  const sessionToken = options.sessionToken || undefined;

  return async (c: Context, next: Next) => {
    const origin = c.req.header("origin");

    if (origin !== undefined) {
      if (!allowedOrigins.has(origin)) {
        return c.json(
          {
            error: "Origin is not allowed",
            hint: "If this is a trusted dev UI, add its origin to ALLOWED_ORIGINS (comma-separated), e.g. http://localhost:5173.",
          },
          403,
        );
      }
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Vary", "Origin");
      c.header("Access-Control-Allow-Methods", API_METHODS);
      c.header("Access-Control-Allow-Headers", API_HEADERS);
    }

    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    const isHealth = c.req.method === "GET" && c.req.path === HEALTH_PATH;
    if (sessionToken && !isHealth) {
      const provided = c.req.header(SESSION_HEADER) ?? "";
      if (!constantTimeEquals(provided, sessionToken)) {
        return c.json(
          {
            error: "Missing or invalid X-App-Session header",
            hint: "Send the session token from the desktop app in the X-App-Session header.",
          },
          401,
        );
      }
    }

    await next();
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
}
