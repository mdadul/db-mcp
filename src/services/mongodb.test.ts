import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CreateDatabaseSchema } from "../api/routes/databases/types.ts";
import { assertReadOnly, injectLimit } from "../query/safety.ts";

describe("MongoDB Support", () => {
  test("CreateDatabaseSchema accepts mongodb database type", () => {
    const valid = CreateDatabaseSchema.parse({
      name: "My Mongo Database",
      type: "mongodb",
      host: "localhost",
      port: 27017,
      databaseName: "app_db",
      username: "root",
      password: "password123",
      ssl: false,
    });

    assert.equal(valid.type, "mongodb");
    assert.equal(valid.port, 27017);
  });

  test("assertReadOnly permits a well-formed find DSL", () => {
    assert.doesNotThrow(() =>
      assertReadOnly(JSON.stringify({ collection: "orders", filter: { status: "paid" } }), "mongodb")
    );
    assert.doesNotThrow(() => assertReadOnly(JSON.stringify({ collection: "orders" }), "mongodb"));
  });

  test("assertReadOnly rejects non-JSON input", () => {
    assert.throws(() => assertReadOnly("db.orders.find({})", "mongodb"));
  });

  test("assertReadOnly rejects a DSL missing the collection field", () => {
    assert.throws(() => assertReadOnly(JSON.stringify({ filter: {} }), "mongodb"));
  });

  test("assertReadOnly rejects unsupported top-level fields", () => {
    assert.throws(() => assertReadOnly(JSON.stringify({ collection: "orders", op: "listCollections" }), "mongodb"));
  });

  test("assertReadOnly blocks code-executing / write operators", () => {
    assert.throws(() =>
      assertReadOnly(JSON.stringify({ collection: "orders", filter: { $where: "this.a == this.b" } }), "mongodb")
    );
    assert.throws(() =>
      assertReadOnly(JSON.stringify({ collection: "orders", filter: {}, projection: { $out: "copy" } }), "mongodb")
    );
  });

  test("injectLimit fills in a default limit for MongoDB DSL", () => {
    const result = JSON.parse(injectLimit(JSON.stringify({ collection: "orders" }), 50, "mongodb"));
    assert.equal(result.limit, 50);
  });

  test("injectLimit preserves an explicit limit already set by the caller", () => {
    const result = JSON.parse(injectLimit(JSON.stringify({ collection: "orders", limit: 5 }), 50, "mongodb"));
    assert.equal(result.limit, 5);
  });
});
