import type { Context, Next } from "hono";

/**
 * Validates the MCP_TOKEN bearer token on the /mcp endpoint.
 * Uses a timing-safe comparison to prevent timing attacks.
 */
export async function mcpAuth(c: Context, next: Next): Promise<void> {
  const token = process.env.MCP_TOKEN;
  if (!token) {
    c.res = c.json({ error: "MCP_TOKEN not configured on the server" }, 500);
    return;
  }

  const authHeader = c.req.header("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    c.res = c.json(
      { error: "Missing or malformed Authorization header. Expected: Bearer <token>" },
      401
    );
    return;
  }

  const provided = authHeader.slice(7);
  if (!timingSafeEqual(provided, token)) {
    c.res = c.json({ error: "Invalid token" }, 401);
    return;
  }

  await next();
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i]! ^ bBytes[i]!;
  }
  return diff === 0;
}
