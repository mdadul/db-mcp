import { hc } from "hono/client";
import type { AppType } from "@server/app.ts";

// In dev: Vite proxies /api → localhost:4080
// In prod: same origin serves both frontend and backend
export const client = hc<AppType>("/");
