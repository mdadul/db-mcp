import assert from "node:assert/strict";
import { parseChartSpec } from "../chartHelpers.ts";
import { renderMarkdown } from "../markdown.ts";
import { parseAnalystEvents } from "../sse.ts";
import { aggregateValues, binValue, timeUnitValue, transformChartData, type ChartSpec } from "../chartHelpers.ts";

const ssePayload = [
  'data: {"type":"text.delta","text":"split',
  ' JSON"}\r',
  '\n\r\ndata: {"type":"tool.result","toolCallId":"tool-1","ok":true,"summary":"done","rowCount":2}\n\n',
].join("");
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    const bytes = new TextEncoder().encode(ssePayload);
    controller.enqueue(bytes.slice(0, 29));
    controller.enqueue(bytes.slice(29, 61));
    controller.enqueue(bytes.slice(61));
    controller.close();
  },
});
const parsed = [];
for await (const event of parseAnalystEvents(stream)) parsed.push(event);
assert.deepEqual(parsed, [
  { type: "text.delta", text: "split JSON" },
  { type: "tool.result", toolCallId: "tool-1", ok: true, summary: "done", rowCount: 2 },
]);

const html = renderMarkdown('<script>alert("x")</script> [unsafe](javascript:alert(1)) [safe](https://example.com)');
assert.ok(html.includes("&lt;script&gt;"));
assert.ok(!html.includes('href="javascript:'));
assert.ok(html.includes('href="https://example.com"'));

assert.equal(binValue(9, 2, { start: 0, step: 10 }), "0–10");
assert.equal(timeUnitValue("2025-02-11T12:33:00Z", "yearmonth"), "2025-02");
assert.equal(aggregateValues([2, 4, 9], "median"), 4);
const chartSpec = parseChartSpec({ mark: "bar", encoding: { x: { field: "month", type: "temporal", timeUnit: "yearmonth" }, y: { field: "value", aggregate: "sum", stack: "zero" }, color: { field: "segment" } } });
assert.ok(chartSpec);
const chartPoints = transformChartData([
  { month: "2025-01-03T00:00:00Z", value: 3, segment: "A" },
  { month: "2025-01-20T00:00:00Z", value: 2, segment: "A" },
  { month: "2025-01-20T00:00:00Z", value: 4, segment: "B" },
], chartSpec);
assert.deepEqual(chartPoints.map(({ x, y, y0 }) => ({ x, y, y0 })), [
  { x: "2025-01", y: 5, y0: 0 },
  { x: "2025-01", y: 9, y0: 5 },
]);

process.stdout.write("Analyst pure-contract checks passed\n");
