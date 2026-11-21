import assert from "node:assert/strict";
import test from "node:test";
import { activityQuerySchema } from "./schema.ts";

test("activity query defaults pagination and coerces numeric values", () => {
  assert.deepEqual(activityQuerySchema.parse({}), { limit: 50, offset: 0 });
  assert.deepEqual(activityQuerySchema.parse({ limit: "25", offset: "10" }), {
    limit: 25,
    offset: 10,
  });
});

test("activity query caps page size and rejects invalid filters", () => {
  assert.equal(activityQuerySchema.safeParse({ limit: "201" }).success, false);
  assert.equal(activityQuerySchema.safeParse({ offset: "-1" }).success, false);
  assert.equal(activityQuerySchema.safeParse({ offset: "10001" }).success, false);
  assert.equal(activityQuerySchema.safeParse({ status: "unknown" }).success, false);
  assert.equal(activityQuerySchema.safeParse({ tool: " " }).success, false);
});
