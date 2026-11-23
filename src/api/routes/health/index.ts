import { Hono } from "hono";
import pkg from "../../../../package.json" with { type: "json" };

// package.json has no "version" field yet; fall back until one is added.
const pkgVersion = (pkg as Record<string, unknown>).version;
const APP_VERSION = typeof pkgVersion === "string" ? pkgVersion : "0.0.0";

export const healthRoutes = new Hono().get("/health", (c) =>
  c.json({
    status: "ok",
    app: "db-mcp",
    version: APP_VERSION,
    pid: process.pid,
  } as const)
);
