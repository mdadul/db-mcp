import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { clearResults, getResult, resultStoreSize, storeResult } from "./resultStore.ts";
import type { LanguageModelV4StreamResult } from "@ai-sdk/provider";

const ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("analyst backend", async (t) => {
const fixture = await setup(t);

await t.test("result store evicts least-recently-used entries", () => {
  clearResults();
  const first = storeResult({ threadId: "thread", columns: [], rows: [], rowCount: 0, truncated: false });
  const second = storeResult({ threadId: "thread", columns: [], rows: [], rowCount: 0, truncated: false });
  assert.ok(getResult(first.resultId));
  for (let index = 0; index < 49; index += 1) storeResult({ threadId: "thread", columns: [], rows: [], rowCount: index, truncated: false });
  assert.equal(getResult(first.resultId), first);
  assert.equal(getResult(second.resultId), undefined);
  assert.equal(resultStoreSize().count, 50);
  clearResults();
});

await t.test("providers redact API keys and validate compatible base URLs", async () => {
  const invalid = await fixture.app.request("/api/analyst/providers", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "openai-compatible", name: "Local", baseUrl: "file:///tmp/api", defaultModel: "model" }),
  });
  assert.equal(invalid.status, 400);
  const userInfo = await fixture.app.request("/api/analyst/providers", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "openai-compatible", name: "Private URL", baseUrl: "https://user:pass@example.com/v1", defaultModel: "model" }),
  });
  assert.equal(userInfo.status, 400);

  const created = await fixture.app.request("/api/analyst/providers", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "openai", name: "Private provider", apiKey: "sk-secret-for-test", defaultModel: "gpt-test" }),
  });
  assert.equal(created.status, 201);
  const provider = await created.json() as { id: string; hasApiKey: boolean };
  assert.equal(provider.hasApiKey, true);
  assert.equal(JSON.stringify(provider).includes("sk-secret-for-test"), false);
  const listed = await fixture.app.request("/api/analyst/providers");
  assert.equal(JSON.stringify(await listed.json()).includes("sk-secret-for-test"), false);

  const updated = await fixture.app.request(`/api/analyst/providers/${provider.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Renamed", apiKey: "" }),
  });
  assert.equal((await updated.json() as { hasApiKey: boolean }).hasApiKey, true);
});

await t.test("tools use read-only query service and return preview-only data", async () => {
  const connection = await fixture.createConnection();
  const { createAnalystTools } = await import("./tools.ts");
  const tools = createAnalystTools("thread", connection.id);
  const result = await tools.run_query.execute({ query: "SELECT name FROM people ORDER BY name", limit: 100 }, { toolCallId: "call", messages: [], abortSignal: new AbortController().signal, context: {} });
  assert.ok("resultId" in result);
  assert.ok("previewRows" in result);
  assert.deepEqual(result.previewRows, [{ name: "Ada" }, { name: "Grace" }, { name: "Linus" }]);
  assert.equal(JSON.stringify(result).includes("full-result-secret"), false);
  assert.ok(getResult(result.resultId, "thread"));
  assert.equal(getResult(result.resultId, "other-thread"), undefined);
  const { db } = await import("../db/client.ts");
  const { queryLogs } = await import("../db/schema.ts");
  const logs = await db.select().from(queryLogs);
  assert.equal(logs.findLast((log) => log.query.includes("SELECT name FROM people"))?.source, "agent");
  await tools.sample_rows.execute({ table: "people", limit: 1 }, { toolCallId: "sample", messages: [], abortSignal: new AbortController().signal, context: {} });
  const sampleLogs = await db.select().from(queryLogs);
  assert.equal(sampleLogs.findLast((log) => log.query.includes("FROM \"people\""))?.source, "agent");
});

await t.test("SSE streams text, enforces one active turn, and supports cancellation", async (subtest) => {
  const connection = await fixture.createConnection();
  const providerServer = await startOpenAICompatibleServer({ delayMs: 1000 });
  subtest.after(() => new Promise<void>((resolve) => providerServer.close(() => resolve())));
  const provider = await fixture.createProvider(providerServer.url);
  const threadResponse = await fixture.app.request("/api/analyst/threads", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId: provider.id, model: "mock-model", databaseId: connection.id }),
  });
  const thread = await threadResponse.json() as { id: string };

  const first = await fixture.app.request(`/api/analyst/threads/${thread.id}/messages`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Count people" }),
  });
  assert.equal(first.status, 200);
  const eventsPromise = readEvents(first);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const busy = await fixture.app.request(`/api/analyst/threads/${thread.id}/messages`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Another request" }),
  });
  assert.equal(busy.status, 409);
  const cancel = await fixture.app.request(`/api/analyst/threads/${thread.id}/cancel`, { method: "POST" });
  assert.equal(cancel.status, 200);
  const events = await eventsPromise;
  assert.deepEqual(events.map((event) => event.type), ["message.start", "turn.done"]);
  assert.equal(events.at(-1)?.finishReason, "abort");
  const savedThread = await fixture.app.request(`/api/analyst/threads/${thread.id}`);
  const savedMessages = await savedThread.json() as { messages: { role: string; content: unknown }[] };
  assert.ok(JSON.stringify(savedMessages.messages).includes("aborted"));
});

await t.test("SSE emits tool lifecycle and persists full result while the model gets only preview rows", async (subtest) => {
  const connection = await fixture.createConnection();
  const providerServer = await startOpenAICompatibleServer({ toolQuery: "SELECT name, note FROM people ORDER BY name" });
  subtest.after(() => new Promise<void>((resolve) => providerServer.close(() => resolve())));
  const provider = await fixture.createProvider(providerServer.url);
  const threadResponse = await fixture.app.request("/api/analyst/threads", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId: provider.id, model: "mock-model", databaseId: connection.id }),
  });
  const thread = await threadResponse.json() as { id: string };
  const response = await fixture.app.request(`/api/analyst/threads/${thread.id}/messages`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Show names and notes" }),
  });
  const events = await readEvents(response);
  assert.deepEqual(events.map((event) => event.type), ["message.start", "tool.call", "tool.result", "text.delta", "usage", "turn.done"], JSON.stringify({ events, requests: providerServer.requests }));
  const resultEvent = events.find((event) => event.type === "tool.result");
  assert.equal(resultEvent?.ok, true);
  assert.equal(typeof resultEvent?.resultId, "string");
  assert.equal(providerServer.toolResultMessage.includes("full-result-secret"), false);
  const storedResponse = await fixture.app.request(`/api/analyst/results/${resultEvent?.resultId}`);
  assert.equal(storedResponse.status, 200);
  const stored = await storedResponse.json() as { rows: { note: string }[] };
  assert.equal(stored.rows[0]?.note, "full-result-secret");
});

await t.test("model loop executes analyst tools with the AI SDK v4 mock", async () => {
  const connection = await fixture.createConnection();
  const provider = await fixture.createProvider("http://127.0.0.1:1/v1");
  const threadResponse = await fixture.app.request("/api/analyst/threads", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId: provider.id, model: "mock-model", databaseId: connection.id }),
  });
  const thread = await threadResponse.json() as { id: string };
  let callCount = 0;
  const model = new MockLanguageModelV4({ doStream: async () => {
    callCount += 1;
    const streamParts = callCount === 1
      ? [{ type: "tool-call" as const, toolCallId: "mock-call", toolName: "run_query", input: JSON.stringify({ query: "SELECT name FROM people ORDER BY name", limit: 2 }) }, { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: "tool_calls" }, usage: usage() }]
      : [{ type: "text-start" as const, id: "text" }, { type: "text-delta" as const, id: "text", delta: "Found three names." }, { type: "text-end" as const, id: "text" }, { type: "finish" as const, finishReason: { unified: "stop" as const, raw: "stop" }, usage: usage() }];
    return streamResult(streamParts);
  } });
  const { runTurnWithModel } = await import("./service.ts");
  const events: { type: string; [key: string]: unknown }[] = [];
  await runTurnWithModel(thread.id, "Count people", connection.id, model, new AbortController().signal, (event) => events.push(event));
  assert.equal(callCount, 2);
  assert.ok(events.some((event) => event.type === "tool.call"));
  assert.equal(events.at(-1)?.type, "turn.done");
  const secondPrompt = model.doStreamCalls[1]?.prompt;
  assert.ok(JSON.stringify(secondPrompt).includes("Ada"));
  assert.equal(JSON.stringify(secondPrompt).includes("full-result-secret"), false);
});
});

function usage() {
  return { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
}
function streamResult(parts: { type: string; [key: string]: unknown }[]): LanguageModelV4StreamResult {
  return { stream: new ReadableStream({ start(controller) {
    controller.enqueue({ type: "stream-start", warnings: [] });
    for (const part of parts as { type: string }[]) controller.enqueue(part as never);
    controller.close();
  } }) };
}

async function readEvents(response: Response) {
  const text = await response.text();
  const events = text.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)) as { type: string; [key: string]: unknown });
  assert.ok(events.length > 0, `Expected SSE events, got status ${response.status}: ${text}`);
  return events;
}
async function setup(t: import("node:test").TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "db-mcp-analyst-"));
  process.env.DATABASE_PATH = join(directory, "control.sqlite");
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  const externalPath = join(directory, "external.sqlite");
  const Database = (await import("better-sqlite3")).default;
  const external = new Database(externalPath);
  external.exec("CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT NOT NULL, note TEXT); INSERT INTO people (name, note) VALUES ('Ada', 'full-result-secret'), ('Grace', 'internal'), ('Linus', 'internal');");
  external.close();
  const { runMigrations } = await import("../db/runMigrations.ts");
  await runMigrations();
  const { app } = await import("../app.ts");
  const { closeAll } = await import("../services/connPool.ts");
  const { closeDb } = await import("../db/client.ts");
  clearResults();
  t.after(async () => {
    await closeAll();
    closeDb();
    clearResults();
    await rm(directory, { recursive: true, force: true });
    delete process.env.DATABASE_PATH;
    delete process.env.ENCRYPTION_KEY;
  });
  return {
    app,
    createConnection: async () => {
      const response = await app.request("/api/databases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Test DB", type: "sqlite", databaseName: externalPath, password: "unused" }) });
      return await response.json() as { id: string };
    },
    createProvider: async (baseUrl: string) => {
      const response = await app.request("/api/analyst/providers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "openai-compatible", name: "Test server", baseUrl, defaultModel: "mock-model" }) });
      return await response.json() as { id: string };
    },
  };
}

function startOpenAICompatibleServer(options: { toolQuery?: string; completeImmediately?: boolean; delayMs?: number } = {}): Promise<Server & { url: string; requests: number; toolResultMessage: string }> {
  return new Promise((resolve) => {
    let requests = 0;
    let toolResultMessage = "";
    const server = createServer(async (request, response) => {
      if (request.method !== "POST") { response.writeHead(404).end(); return; }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const payload = JSON.parse(Buffer.concat(chunks).toString()) as { messages?: { role: string; content?: string; tool_calls?: unknown[] }[] };
      requests += 1;
      const previousToolResult = payload.messages?.find((message) => message.role === "tool");
      if (previousToolResult?.content) toolResultMessage = previousToolResult.content;
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (options.toolQuery && requests === 1) {
        send({ id: "chatcmpl-mock", object: "chat.completion.chunk", created: 1, model: "mock-model", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call-mock", type: "function", function: { name: "run_query", arguments: JSON.stringify({ query: options.toolQuery ?? "SELECT name FROM people ORDER BY name", limit: 2 }) } }] }, finish_reason: "tool_calls" }] });
      } else {
        if (previousToolResult?.content) toolResultMessage = previousToolResult.content;
        setTimeout(() => {
          send({ id: "chatcmpl-mock", object: "chat.completion.chunk", created: 1, model: "mock-model", choices: [{ index: 0, delta: { role: "assistant", content: "The result is ready." }, finish_reason: null }] });
          send({ id: "chatcmpl-mock", object: "chat.completion.chunk", created: 1, model: "mock-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
          response.write("data: [DONE]\n\n");
          response.end();
        }, options.delayMs ?? 0);
        return;
      }
      response.write("data: [DONE]\n\n");
      response.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Mock provider did not bind to a TCP port");
      resolve(Object.assign(server, { url: `http://127.0.0.1:${address.port}/v1`, get requests() { return requests; }, get toolResultMessage() { return toolResultMessage; } }));
    });
  });
}
