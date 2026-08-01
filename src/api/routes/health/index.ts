import { Hono } from "hono";

export const healthRoutes = new Hono().get("/health", (c) =>
  c.json({ status: "ok", version: "1.0.0" } as const)
);
