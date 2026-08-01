import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CreateDatabaseSchema } from "../api/routes/databases/types.ts";
import { assertReadOnly, injectLimit } from "../query/safety.ts";

describe("MySQL Support", () => {
  test("CreateDatabaseSchema accepts mysql database type", () => {
    const valid = CreateDatabaseSchema.parse({
      name: "My MySQL Database",
      type: "mysql",
      host: "localhost",
      port: 3306,
      databaseName: "app_db",
      username: "root",
      password: "password123",
      ssl: false,
    });

    assert.equal(valid.type, "mysql");
    assert.equal(valid.port, 3306);
  });

  test("assertReadOnly permits read-only MySQL queries", () => {
    assert.doesNotThrow(() => assertReadOnly("SELECT * FROM users"));
    assert.doesNotThrow(() => assertReadOnly("SHOW TABLES"));
    assert.doesNotThrow(() => assertReadOnly("DESCRIBE users"));
    assert.doesNotThrow(() => assertReadOnly("EXPLAIN SELECT 1"));
  });

  test("assertReadOnly blocks data-modifying MySQL queries", () => {
    assert.throws(() => assertReadOnly("INSERT INTO users VALUES (1)"));
    assert.throws(() => assertReadOnly("UPDATE users SET name='test'"));
    assert.throws(() => assertReadOnly("DELETE FROM users"));
    assert.throws(() => assertReadOnly("DROP TABLE users"));
    assert.throws(() => assertReadOnly("REPLACE INTO users VALUES (1)"));
  });

  test("injectLimit appends LIMIT clause correctly for MySQL queries", () => {
    const result = injectLimit("SELECT * FROM users", 50);
    assert.equal(result, "SELECT * FROM users LIMIT 50");
  });
});
