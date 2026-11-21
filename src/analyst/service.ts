import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isStepCount, streamText, type LanguageModel, type ModelMessage, type ToolModelMessage } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { aiProviders, analystMessages, analystThreads, databaseConnections } from "../db/schema.ts";
import { decrypt, encrypt, type EncryptedPayload } from "../services/credentials.ts";
import { AppError, BadRequestError, NotFoundError } from "../errors.ts";
import { buildAnalystSystemPrompt } from "./prompt.ts";
import { createAnalystTools } from "./tools.ts";

export type ProviderKind = "anthropic" | "openai" | "openai-compatible";
export type ProviderInput = { kind: ProviderKind; name: string; baseUrl?: string | null; apiKey?: string; defaultModel: string };
export type ProviderView = { id: string; kind: ProviderKind; name: string; baseUrl: string | null; hasApiKey: boolean; defaultModel: string; createdAt: string; updatedAt: string };
export type ThreadView = { id: string; title: string; providerId: string; model: string; databaseId: string | null; createdAt: string; updatedAt: string };
export type MessageView = { id: string; threadId: string; role: string; content: unknown; createdAt: string; usage: unknown };

const DEFAULT_MODELS: Record<ProviderKind, string[]> = {
  anthropic: ["claude-sonnet-4-5", "claude-haiku-4-5"],
  openai: ["gpt-4.1", "gpt-4.1-mini", "o4-mini"],
  "openai-compatible": ["llama3.2", "qwen2.5", "gpt-4o-mini"],
};

function safeProvider(row: typeof aiProviders.$inferSelect): ProviderView {
  return { id: row.id, kind: row.kind as ProviderKind, name: row.name, baseUrl: row.baseUrl, hasApiKey: Boolean(row.encryptedApiKey), defaultModel: row.defaultModel, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function safeThread(row: typeof analystThreads.$inferSelect): ThreadView {
  return { id: row.id, title: row.title, providerId: row.providerId, model: row.model, databaseId: row.databaseId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function safeMessage(row: typeof analystMessages.$inferSelect): MessageView {
  let content: unknown = [];
  let usage: unknown = null;
  try { content = JSON.parse(row.content); } catch { content = []; }
  try { usage = row.usage ? JSON.parse(row.usage) : null; } catch { usage = null; }
  return { id: row.id, threadId: row.threadId, role: row.role, content, createdAt: row.createdAt.toISOString(), usage };
}

function validateProvider(input: ProviderInput): void {
  if (!(input.kind in DEFAULT_MODELS)) throw new BadRequestError("Unsupported provider kind", "Use anthropic, openai, or openai-compatible.");
  if (input.kind === "openai-compatible" && !input.baseUrl) throw new BadRequestError("Base URL is required", "Enter an HTTP or HTTPS OpenAI-compatible API URL.");
  if (input.baseUrl) {
    let url: URL;
    try { url = new URL(input.baseUrl); } catch { throw new BadRequestError("Invalid base URL", "Enter a valid HTTP or HTTPS URL."); }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new BadRequestError("Invalid base URL protocol", "The provider base URL must use HTTP or HTTPS.");
    if (url.username || url.password) throw new BadRequestError("Credentials cannot be embedded in the base URL", "Provide the API key in the separate API key field.");
  }
  if (input.kind !== "openai-compatible" && !input.apiKey?.trim()) throw new BadRequestError("API key is required", "Enter an API key for this provider.");
}

export async function listProviders(): Promise<ProviderView[]> {
  return (await db.select().from(aiProviders).orderBy(desc(aiProviders.createdAt))).map(safeProvider);
}
export async function createProvider(input: ProviderInput): Promise<ProviderView> {
  validateProvider(input);
  const [row] = await db.insert(aiProviders).values({ kind: input.kind, name: input.name.trim(), baseUrl: input.baseUrl?.trim() || null, encryptedApiKey: input.apiKey?.trim() ? JSON.stringify(await encrypt(input.apiKey.trim())) : null, defaultModel: input.defaultModel.trim() }).returning();
  return safeProvider(row!);
}
export async function updateProvider(id: string, input: Partial<ProviderInput>): Promise<ProviderView> {
  const row = await requireProvider(id);
  const next = { kind: input.kind ?? row.kind as ProviderKind, name: input.name ?? row.name, baseUrl: input.baseUrl === undefined ? row.baseUrl : input.baseUrl, apiKey: input.apiKey, defaultModel: input.defaultModel ?? row.defaultModel };
  validateProvider({ ...next, apiKey: input.apiKey?.trim() || (row.encryptedApiKey ? "existing" : undefined) });
  const updates: Partial<typeof aiProviders.$inferInsert> = { name: next.name.trim(), kind: next.kind, baseUrl: next.baseUrl?.trim() || null, defaultModel: next.defaultModel.trim(), updatedAt: new Date() };
  if (input.apiKey?.trim()) updates.encryptedApiKey = JSON.stringify(await encrypt(input.apiKey.trim()));
  const [updated] = await db.update(aiProviders).set(updates).where(eq(aiProviders.id, id)).returning();
  return safeProvider(updated!);
}
export async function deleteProvider(id: string): Promise<void> {
  await requireProvider(id);
  await db.delete(aiProviders).where(eq(aiProviders.id, id));
}
async function requireProvider(id: string) {
  const [row] = await db.select().from(aiProviders).where(eq(aiProviders.id, id));
  if (!row) throw new NotFoundError("AI provider", id);
  return row;
}
async function providerKey(row: typeof aiProviders.$inferSelect): Promise<string | undefined> {
  if (!row.encryptedApiKey) return undefined;
  try { return await decrypt(JSON.parse(row.encryptedApiKey) as EncryptedPayload); }
  catch { throw new AppError(500, "Provider credentials could not be decrypted", "Check that the desktop app's encryption key is available."); }
}

export async function testProvider(id: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const row = await requireProvider(id);
  const key = await providerKey(row);
  const started = Date.now();
  const abort = AbortSignal.timeout(10_000);
  try {
    const model = createLanguageModel(row, key);
    await streamText({ model, prompt: "Reply with the single word OK.", maxOutputTokens: 8, abortSignal: abort }).text;
    return { success: true, message: "Provider connection successful", latencyMs: Date.now() - started };
  } catch (error) {
    return { success: false, message: redactProviderError(error, key), latencyMs: Date.now() - started };
  }
}

export async function listProviderModels(id: string): Promise<{ models: string[]; source: "remote" | "fallback" }> {
  const row = await requireProvider(id);
  try {
    const key = await providerKey(row);
    const url = row.kind === "anthropic" ? "https://api.anthropic.com/v1/models" : row.kind === "openai" ? "https://api.openai.com/v1/models" : `${row.baseUrl!.replace(/\/$/, "")}/models`;
    const headers: Record<string, string> = row.kind === "anthropic" ? { "x-api-key": key ?? "", "anthropic-version": "2023-06-01" } : key ? { Authorization: `Bearer ${key}` } : {};
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Model list request failed");
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) throw new Error("Unexpected model list response");
    const models = payload.data.flatMap((item: unknown) => item && typeof item === "object" && "id" in item && typeof item.id === "string" ? [item.id] : []);
    if (!models.length) throw new Error("Model list was empty");
    return { models: models.sort(), source: "remote" };
  } catch {
    return { models: DEFAULT_MODELS[row.kind as ProviderKind], source: "fallback" };
  }
}

export function createLanguageModel(row: typeof aiProviders.$inferSelect, apiKey?: string) {
  switch (row.kind as ProviderKind) {
    case "anthropic": return createAnthropic({ apiKey })(row.defaultModel);
    case "openai": return createOpenAI({ apiKey })(row.defaultModel);
    case "openai-compatible": return createOpenAICompatible({ name: `analyst-${row.id}`, baseURL: row.baseUrl!, ...(apiKey ? { apiKey } : {}) })(row.defaultModel);
  }
}

function redactProviderError(error: unknown, key?: string): string {
  const message = error instanceof Error ? error.message : "Provider request failed";
  return (key ? message.split(key).join("[redacted]") : message).replace(/(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+)/g, "[redacted]").slice(0, 500);
}

export async function listThreads(): Promise<ThreadView[]> {
  return (await db.select().from(analystThreads).orderBy(desc(analystThreads.updatedAt))).map(safeThread);
}
export async function createThread(input: { title?: string; providerId: string; model: string; databaseId?: string | null }): Promise<ThreadView> {
  await requireProvider(input.providerId);
  if (input.databaseId) {
    const [connection] = await db.select({ id: databaseConnections.id }).from(databaseConnections).where(eq(databaseConnections.id, input.databaseId));
    if (!connection) throw new NotFoundError("Database", input.databaseId);
  }
  const [row] = await db.insert(analystThreads).values({ title: input.title?.trim() || "New analysis", providerId: input.providerId, model: input.model.trim(), databaseId: input.databaseId ?? null }).returning();
  return safeThread(row!);
}
export async function getThread(id: string): Promise<{ thread: ThreadView; messages: MessageView[] }> {
  const thread = await requireThread(id);
  const messages = await db.select().from(analystMessages).where(eq(analystMessages.threadId, id)).orderBy(analystMessages.createdAt);
  return { thread: safeThread(thread), messages: messages.map(safeMessage) };
}
export async function renameThread(id: string, title: string): Promise<ThreadView> {
  await requireThread(id);
  const [row] = await db.update(analystThreads).set({ title: title.trim(), updatedAt: new Date() }).where(eq(analystThreads.id, id)).returning();
  return safeThread(row!);
}
export async function deleteThread(id: string): Promise<void> {
  await requireThread(id);
  await db.delete(analystThreads).where(eq(analystThreads.id, id));
}
async function requireThread(id: string) {
  const [row] = await db.select().from(analystThreads).where(eq(analystThreads.id, id));
  if (!row) throw new NotFoundError("Analyst thread", id);
  return row;
}

export type TurnEvent =
  | { type: "message.start"; messageId: string }
  | { type: "text.delta"; text: string }
  | { type: "tool.call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool.result"; toolCallId: string; ok: boolean; summary: string; rowCount?: number; resultId?: string; error?: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "error"; message: string; hint: string }
  | { type: "turn.done"; messageId: string; finishReason: string };

export async function runTurn(threadId: string, text: string, databaseId: string | null, signal: AbortSignal, emit: (event: TurnEvent) => void): Promise<void> {
  const thread = await requireThread(threadId);
  const provider = await requireProvider(thread.providerId);
  const apiKey = await providerKey(provider);
  return runTurnWithModel(threadId, text, databaseId, createLanguageModel({ ...provider, defaultModel: thread.model }, apiKey), signal, emit);
}

export async function runTurnWithModel(threadId: string, text: string, databaseId: string | null, model: LanguageModel, signal: AbortSignal, emit: (event: TurnEvent) => void): Promise<void> {
  const thread = await requireThread(threadId);
  const provider = await requireProvider(thread.providerId);
  const apiKey = await providerKey(provider);
  const existing = await db.select().from(analystMessages).where(eq(analystMessages.threadId, threadId)).orderBy(analystMessages.createdAt);
  const database = databaseId ?? thread.databaseId;
  const [newUserMessage] = await db.insert(analystMessages).values({ threadId, role: "user", content: JSON.stringify([{ type: "text", text }]) }).returning();
  const title = existing.length === 0 ? text.trim().replace(/\s+/g, " ").slice(0, 60) || "New analysis" : undefined;
  if (databaseId) {
    const [selectedDatabase] = await db.select({ id: databaseConnections.id, status: databaseConnections.status }).from(databaseConnections).where(eq(databaseConnections.id, databaseId));
    if (!selectedDatabase) throw new NotFoundError("Database", databaseId, "Choose an existing database or use the thread's default database.");
    if (selectedDatabase.status !== "enabled") throw new BadRequestError("Selected database is disabled", "Enable the connection before using it with Analyst.");
  }
  if (newUserMessage && databaseId && databaseId !== thread.databaseId) {
    await db.update(analystThreads).set({ databaseId, updatedAt: new Date() }).where(eq(analystThreads.id, threadId));
  }
  await db.update(analystThreads).set({ ...(title ? { title } : {}), updatedAt: new Date() }).where(eq(analystThreads.id, threadId));
  const assistantMessageId = crypto.randomUUID();
  const connections = await databaseServiceList();
  let accumulatedText = "";
  let finishReason = "unknown";
  let usage = { inputTokens: 0, outputTokens: 0 };
  const history: { role: "assistant" | "tool"; content: unknown[]; id?: string }[] = [];

  try {
    emit({ type: "message.start", messageId: assistantMessageId });
    const messages: ModelMessage[] = [...groupHistoricalMessages(existing), { role: "user", content: text }];
    const result = streamText({
      model,
      system: buildAnalystSystemPrompt(connections, database),
      messages,
      tools: createAnalystTools(threadId, database),
      stopWhen: isStepCount(12),
      abortSignal: signal,
      onStepFinish: (step) => {
        finishReason = step.finishReason;
        usage = { inputTokens: step.usage.inputTokens ?? 0, outputTokens: step.usage.outputTokens ?? 0 };
      },
    });
    for await (const part of result.stream) {
      if (part.type === "text-delta") {
        accumulatedText += part.text;
        const last = history.at(-1);
        const textPart = last?.role === "assistant" ? last.content.at(-1) : undefined;
        if (textPart && typeof textPart === "object" && "type" in textPart && textPart.type === "text" && "text" in textPart && typeof textPart.text === "string") {
          textPart.text += part.text;
        } else {
          history.push({ role: "assistant", id: history.length === 0 ? assistantMessageId : crypto.randomUUID(), content: [{ type: "text", text: part.text }] });
        }
        emit({ type: "text.delta", text: part.text });
      } else if (part.type === "tool-call") {
        const call = { toolCallId: part.toolCallId, toolName: part.toolName, args: part.input };
        history.push({ role: "assistant", id: history.length === 0 ? assistantMessageId : crypto.randomUUID(), content: [{ type: "tool-call", toolCallId: call.toolCallId, toolName: call.toolName, args: call.args }] });
        emit({ type: "tool.call", ...call });
      } else if (part.type === "tool-result") {
        const output = part.output;
        const outputValue = output && typeof output === "object" && "value" in output ? output.value : output;
        history.push({ role: "tool", content: [{ type: "tool-result", toolCallId: part.toolCallId, toolName: part.toolName, result: summarizeResult(outputValue) }] });
        const record = outputValue && typeof outputValue === "object" ? outputValue as Record<string, unknown> : {};
        const isError = "error" in record;
        emit({ type: "tool.result", toolCallId: part.toolCallId, ok: !isError, summary: isError ? String(record.error) : `${part.toolName} completed`, ...(typeof record.rowCount === "number" ? { rowCount: record.rowCount } : {}), ...(typeof record.resultId === "string" ? { resultId: record.resultId } : {}), ...(isError ? { error: String(record.error) } : {}) });
      } else if (part.type === "finish") {
        finishReason = part.finishReason;
        usage = { inputTokens: part.totalUsage.inputTokens ?? 0, outputTokens: part.totalUsage.outputTokens ?? 0 };
      } else if (part.type === "error") {
        emit({ type: "error", message: "The model request failed", hint: "Check the provider configuration and try again." });
      }
    }
    const done = await Promise.all([result.finishReason, result.totalUsage]);
    finishReason = done[0];
    usage = { inputTokens: done[1].inputTokens ?? 0, outputTokens: done[1].outputTokens ?? 0 };
    emit({ type: "usage", ...usage });
    try { await persistTurnMessages({ threadId, assistantMessageId, history, accumulatedText, usage, aborted: signal.aborted }); }
    catch { emit({ type: "error", message: "The assistant response could not be saved", hint: "The user message was kept; retry the request if needed." }); }
    emit({ type: "turn.done", messageId: assistantMessageId, finishReason });
  } catch (error) {
    if (!signal.aborted) emit({ type: "error", message: redactProviderError(error, apiKey), hint: "Check the provider settings and retry the message." });
    if (newUserMessage) {
      try { await persistTurnMessages({ threadId, assistantMessageId, history, accumulatedText, usage, aborted: signal.aborted }); }
      catch { emit({ type: "error", message: "The assistant response could not be saved", hint: "The user message was kept; retry the request if needed." }); }
    }
    emit({ type: "turn.done", messageId: assistantMessageId, finishReason: signal.aborted ? "abort" : "error" });
  }
}

async function persistTurnMessages(input: { threadId: string; assistantMessageId: string; history: { role: "assistant" | "tool"; content: unknown[]; id?: string }[]; accumulatedText: string; usage: { inputTokens: number; outputTokens: number }; aborted: boolean }) {
  if (input.history.length === 0) input.history.push({ role: "assistant", id: input.assistantMessageId, content: [] });
  const finalAssistant = input.history.findLast((entry) => entry.role === "assistant");
  if (input.aborted && finalAssistant) finalAssistant.content.push({ type: "aborted" });
  const grouped: typeof input.history = [];
  for (const entry of input.history) {
    const previous = grouped.at(-1);
    if (previous?.role === entry.role) previous.content.push(...entry.content);
    else grouped.push({ ...entry, content: [...entry.content] });
  }
  for (const entry of grouped) {
    await db.insert(analystMessages).values({ id: entry.id, threadId: input.threadId, role: entry.role, content: JSON.stringify(entry.content), ...(entry.id === finalAssistant?.id ? { usage: JSON.stringify(input.usage) } : {}) });
  }
}
function summarizeResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const record = result as Record<string, unknown>;
  if ("previewRows" in record) return { resultId: record.resultId, columns: record.columns, rowCount: record.rowCount, truncated: record.truncated, previewRows: record.previewRows };
  return record;
}
function toModelMessage(message: typeof analystMessages.$inferSelect): ModelMessage {
  let parsed: unknown;
  try { parsed = JSON.parse(message.content); } catch { parsed = []; }
  if (message.role === "user") {
    const text = Array.isArray(parsed) ? parsed.flatMap((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("\n") : "";
    return { role: "user", content: text };
  }
  if (message.role === "tool") {
    const content = Array.isArray(parsed) ? parsed.flatMap((part) => {
      if (!part || typeof part !== "object" || !("type" in part) || part.type !== "tool-result" || !("toolCallId" in part) || typeof part.toolCallId !== "string") return [];
      const toolName = "toolName" in part && typeof part.toolName === "string" ? part.toolName : "unknown";
      const output = "output" in part ? part.output : { type: "json", value: "result" in part ? part.result : null };
      return [{ type: "tool-result" as const, toolCallId: part.toolCallId, toolName, output }];
    }) : [];
    return { role: "tool", content: content as ToolModelMessage["content"] };
  }
  const content = Array.isArray(parsed) ? parsed.flatMap((part) => {
    if (!part || typeof part !== "object" || !("type" in part)) return [];
    if (part.type === "text" && "text" in part && typeof part.text === "string") return [part];
    if (part.type === "tool-call" && "toolCallId" in part && typeof part.toolCallId === "string" && "toolName" in part && typeof part.toolName === "string") {
      const input = "args" in part ? part.args : ("input" in part ? part.input : {});
      return [{ type: "tool-call" as const, toolCallId: part.toolCallId, toolName: part.toolName, input }];
    }
    return [];
  }) : [];
  return { role: "assistant", content: content as Extract<ModelMessage, { role: "assistant" }>["content"] };
}
function groupHistoricalMessages(messages: (typeof analystMessages.$inferSelect)[]): ModelMessage[] {
  const grouped: ModelMessage[] = [];
  for (const message of messages) {
    const converted = toModelMessage(message);
    const previous = grouped.at(-1);
    if (previous?.role === converted.role && converted.role !== "assistant") {
      if (previous.role === "tool" && converted.role === "tool") previous.content.push(...converted.content);
      else if (previous.role === "user" && converted.role === "user") previous.content = `${previous.content}\n${converted.content}`;
    } else {
      grouped.push(converted);
    }
  }
  return grouped;
}
async function databaseServiceList() {
  const rows = await db.select().from(databaseConnections).where(eq(databaseConnections.status, "enabled"));
  return rows.map(({ id, name, type }) => ({ id, name, type }));
}
