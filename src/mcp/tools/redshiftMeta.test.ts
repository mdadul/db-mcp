import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parseRedshiftDistKey, splitQualifiedTableName } from "./redshiftMeta.ts";

describe("parseRedshiftDistKey", () => {
  test("reads the column from KEY(...)", () => {
    assert.equal(parseRedshiftDistKey("KEY(customer_id)"), "customer_id");
  });

  test("reads the column from AUTO(KEY(...))", () => {
    assert.equal(parseRedshiftDistKey("AUTO(KEY(order_id))"), "order_id");
  });

  test("returns null for styles without a key column", () => {
    for (const style of ["EVEN", "ALL", "AUTO(ALL)", "AUTO(EVEN)", null, undefined, 42]) {
      assert.equal(parseRedshiftDistKey(style), null);
    }
  });
});

describe("splitQualifiedTableName", () => {
  test("splits schema.table", () => {
    assert.deepEqual(splitQualifiedTableName("analytics.orders"), {
      schema: "analytics",
      table: "orders",
    });
  });

  test("keeps a bare table name", () => {
    assert.deepEqual(splitQualifiedTableName("orders"), { schema: null, table: "orders" });
  });

  test("ignores a leading or trailing dot", () => {
    assert.deepEqual(splitQualifiedTableName(".orders"), { schema: null, table: ".orders" });
    assert.deepEqual(splitQualifiedTableName("orders."), { schema: null, table: "orders." });
  });
});
