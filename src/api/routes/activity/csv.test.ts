import assert from "node:assert/strict";
import test from "node:test";
import { csvCell, toCsv } from "./csv.ts";
import { activityExportSchema, activityFilterSchema, activityQuerySchema } from "./schema.ts";

test("csv cells quote commas, quotes and newlines", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell(42), "42");
});

test("csv cells starting with formula characters are neutralised", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@sum"), "'@sum");
  assert.equal(csvCell("safe=value"), "safe=value");
});

test("toCsv writes the header and only the requested columns in order", () => {
  const csv = toCsv([{ tool: "list_databases", secret: "x", status: "success" }], ["status", "tool"]);
  assert.equal(csv, "status,tool\r\nsuccess,list_databases\r\n");
});

test("activity filters accept ISO dates and reject invalid ones", () => {
  assert.deepEqual(activityFilterSchema.parse({ from: "2026-01-01T00:00:00.000Z" }), { from: "2026-01-01T00:00:00.000Z" });
  assert.equal(activityFilterSchema.safeParse({ from: "not a date" }).success, false);
  assert.equal(activityQuerySchema.safeParse({ to: "yesterday" }).success, false);
});

test("export defaults to csv and shares the list filters", () => {
  assert.deepEqual(activityExportSchema.parse({}), { format: "csv" });
  assert.deepEqual(activityExportSchema.parse({ format: "json", source: "mcp" }), { format: "json", source: "mcp" });
  assert.equal(activityExportSchema.safeParse({ format: "xlsx" }).success, false);
});
