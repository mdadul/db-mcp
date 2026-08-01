import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { assertReadOnly, injectLimit, MAX_ROWS } from "./safety.ts";

describe("assertReadOnly", () => {
  const allowed = [
    "SELECT * FROM users",
    "select id from orders where id = 1",
    "EXPLAIN SELECT * FROM payments",
    "EXPLAIN ANALYZE SELECT 1",
    "SHOW TABLES",
    "DESCRIBE users",
    "DESC orders",
    "WITH cte AS (SELECT 1) SELECT * FROM cte",
  ];

  for (const sql of allowed) {
    test(`allows: ${sql.slice(0, 50)}`, () => {
      assert.doesNotThrow(() => assertReadOnly(sql));
    });
  }

  const blocked = [
    "INSERT INTO users VALUES (1)",
    "UPDATE users SET name = 'x'",
    "DELETE FROM users",
    "DROP TABLE users",
    "CREATE TABLE foo (id INT)",
    "ALTER TABLE users ADD COLUMN x INT",
    "TRUNCATE users",
    // Write inside a CTE — must be blocked
    "WITH x AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM x",
    "WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x",
    "WITH x AS (UPDATE t SET a=1 RETURNING *) SELECT * FROM x",
  ];

  for (const sql of blocked) {
    test(`blocks: ${sql.slice(0, 60)}`, () => {
      assert.throws(() => assertReadOnly(sql));
    });
  }
});

describe("injectLimit", () => {
  test("appends default LIMIT to a plain SELECT", () => {
    const result = injectLimit("SELECT * FROM users");
    assert.equal(result, `SELECT * FROM users LIMIT ${MAX_ROWS}`);
  });

  test("respects a custom limit argument", () => {
    const result = injectLimit("SELECT 1", 10);
    assert.equal(result, "SELECT 1 LIMIT 10");
  });

  test("does not double-add LIMIT when already present", () => {
    const result = injectLimit("SELECT * FROM users LIMIT 5");
    assert.equal((result.match(/LIMIT/gi) ?? []).length, 1);
  });

  test("does not add LIMIT to EXPLAIN", () => {
    const result = injectLimit("EXPLAIN SELECT * FROM users");
    assert.ok(!result.toUpperCase().includes("LIMIT"));
  });

  test("does not add LIMIT to SHOW", () => {
    assert.ok(!injectLimit("SHOW TABLES").toUpperCase().includes("LIMIT"));
  });

  test("strips trailing semicolon", () => {
    const result = injectLimit("SELECT 1;");
    assert.ok(!result.endsWith(";"));
  });

  test("strips trailing semicolon before checking for existing LIMIT", () => {
    const result = injectLimit("SELECT * FROM t LIMIT 20;");
    assert.equal((result.match(/LIMIT/gi) ?? []).length, 1);
  });
});
