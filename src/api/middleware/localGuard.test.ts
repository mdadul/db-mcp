import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import {
  apiGuard,
  hostGuard,
  mcpOriginGuard,
  parseAllowedOrigins,
} from "./localGuard.ts";

const PORT = 4080;
const LOCAL_HOST = `127.0.0.1:${PORT}`;

function buildApp(options: { sessionToken?: string; allowedOrigins?: string[] } = {}) {
  const root = new Hono();
  root.use("*", hostGuard(PORT));
  root.use(
    "/api/*",
    apiGuard({ sessionToken: options.sessionToken, allowedOrigins: options.allowedOrigins })
  );
  root.all("/mcp", mcpOriginGuard, (c) => c.text("mcp-ok"));
  root.get("/api/health", (c) => c.json({ status: "ok" }));
  root.get("/api/databases", (c) => c.json({ ok: true }));
  root.post("/api/databases", (c) => c.json({ created: true }, 201));
  return root;
}

interface SendOptions {
  method?: string;
  host?: string;
  origin?: string;
  session?: string;
}

function send(app: Hono, path: string, options: SendOptions = {}) {
  const headers: Record<string, string> = { host: options.host ?? LOCAL_HOST };
  if (options.origin !== undefined) headers.origin = options.origin;
  if (options.session !== undefined) headers["x-app-session"] = options.session;
  return app.request(path, { method: options.method ?? "GET", headers });
}

describe("hostGuard", () => {
  const app = buildApp();

  test("allows 127.0.0.1, localhost and [::1] on the server port", async () => {
    for (const host of [`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`]) {
      const res = await send(app, "/api/databases", { host });
      assert.equal(res.status, 200, `host ${host} should be allowed`);
    }
  });

  test("rejects a rebinding host (evil.com) with 403 JSON { error, hint }", async () => {
    const res = await send(app, "/api/health", { host: `evil.com:${PORT}` });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string; hint: string };
    assert.ok(body.error);
    assert.ok(body.hint);
  });

  test("rejects the right hostname on the wrong port", async () => {
    const res = await send(app, "/api/health", { host: "127.0.0.1:9999" });
    assert.equal(res.status, 403);
  });

  test("rejects a missing Host header", async () => {
    const res = await app.request("/api/health");
    assert.equal(res.status, 403);
  });

  test("applies to /mcp as well", async () => {
    const res = await send(app, "/mcp", { method: "POST", host: `evil.com:${PORT}` });
    assert.equal(res.status, 403);
  });
});

describe("mcpOriginGuard", () => {
  const app = buildApp();

  test("rejects /mcp requests that carry an Origin header", async () => {
    const res = await send(app, "/mcp", { method: "POST", origin: "https://evil.com" });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string; hint: string };
    assert.ok(body.error);
    assert.ok(body.hint);
  });

  test("lets /mcp requests without an Origin header through", async () => {
    const res = await send(app, "/mcp", { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "mcp-ok");
  });
});

describe("apiGuard origins and CORS", () => {
  test("rejects /api requests from a disallowed origin with 403", async () => {
    const app = buildApp();
    const res = await send(app, "/api/databases", { origin: "https://evil.com" });
    assert.equal(res.status, 403);
    assert.ok(((await res.json()) as { hint: string }).hint);
  });

  test("gives allowed built-in origins CORS headers", async () => {
    const app = buildApp();
    const res = await send(app, "/api/databases", { origin: "tauri://localhost" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "tauri://localhost");
    assert.match(res.headers.get("vary") ?? "", /Origin/);
  });

  test("honours origins passed through ALLOWED_ORIGINS", async () => {
    const app = buildApp({
      allowedOrigins: parseAllowedOrigins(" http://localhost:5173 , ,https://dev.example "),
    });
    const res = await send(app, "/api/databases", { origin: "http://localhost:5173" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
  });

  test("answers OPTIONS preflight with 204 and the allowed headers", async () => {
    const app = buildApp({ sessionToken: "s3cret" });
    const res = await send(app, "/api/databases", {
      method: "OPTIONS",
      origin: "tauri://localhost",
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "tauri://localhost");
    assert.match(res.headers.get("access-control-allow-headers") ?? "", /X-App-Session/);
    assert.match(res.headers.get("access-control-allow-methods") ?? "", /POST/);
  });

  test("CORS headers are present on 401 errors so the browser can read them", async () => {
    const app = buildApp({ sessionToken: "s3cret" });
    const res = await send(app, "/api/databases", { origin: "tauri://localhost" });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("access-control-allow-origin"), "tauri://localhost");
  });
});

describe("apiGuard session token", () => {
  const TOKEN = "s3cret-token-value";
  const app = buildApp({ sessionToken: TOKEN });

  test("rejects a missing X-App-Session header with 401 JSON { error, hint }", async () => {
    const res = await send(app, "/api/databases");
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string; hint: string };
    assert.ok(body.error);
    assert.ok(body.hint);
  });

  test("rejects a wrong session token, including one of a different length", async () => {
    assert.equal((await send(app, "/api/databases", { session: "wrong-token-value" })).status, 401);
    assert.equal((await send(app, "/api/databases", { session: "short" })).status, 401);
  });

  test("accepts the correct session token", async () => {
    const res = await send(app, "/api/databases", { session: TOKEN });
    assert.equal(res.status, 200);
  });

  test("checks the session on writes as well", async () => {
    const res = await send(app, "/api/databases", { method: "POST" });
    assert.equal(res.status, 401);
  });

  test("exempts GET /api/health from the session check", async () => {
    const res = await send(app, "/api/health");
    assert.equal(res.status, 200);
  });

  test("does not exempt other methods on /api/health", async () => {
    const res = await send(app, "/api/health", { method: "POST" });
    assert.equal(res.status, 401);
  });

  test("passes everything through when no session token is configured", async () => {
    const open = buildApp();
    const res = await send(open, "/api/databases");
    assert.equal(res.status, 200);
  });
});
