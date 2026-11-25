import type { Context } from "hono";

/**
 * zValidator hook that turns a failed request validation into a readable 400.
 *
 * Without a hook, zod-validator returns Zod's own error object as `error`, and
 * clients that expect `{ error: string }` can only show a generic message. This
 * returns the failing field paths and messages as a single string.
 */
type ValidationFailure = {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
};

export function validationHook(
  result: { success: true } | { success: false; error: ValidationFailure },
  c: Context,
) {
  if (result.success) return;
  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
  return c.json({ error: `Invalid request: ${details}` }, 400);
}
