import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { AppError, NotFoundError } from "../errors.ts";
import * as service from "./service.ts";
import { getResult } from "./resultStore.ts";

const providerSchema = z.object({ kind: z.enum(["anthropic", "openai", "openai-compatible"]), name: z.string().trim().min(1).max(120), baseUrl: z.string().trim().max(2048).nullable().optional(), apiKey: z.string().optional(), defaultModel: z.string().trim().min(1).max(200) });
const providerUpdateSchema = providerSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
const threadCreateSchema = z.object({ title: z.string().trim().max(200).optional(), providerId: z.string().min(1), model: z.string().trim().min(1).max(200), databaseId: z.string().min(1).nullable().optional() });
const renameSchema = z.object({ title: z.string().trim().min(1).max(200) });
const messageSchema = z.object({ text: z.string().trim().min(1).max(100_000), databaseId: z.string().min(1).nullable().optional() });

const activeTurns = new Map<string, AbortController>();

export const analystRoutes = new Hono()
  .get("/providers", async (c) => c.json(await service.listProviders()))
  .post("/providers", zValidator("json", providerSchema), async (c) => c.json(await service.createProvider(c.req.valid("json")), 201))
  .patch("/providers/:id", zValidator("json", providerUpdateSchema), async (c) => c.json(await service.updateProvider(c.req.param("id"), c.req.valid("json"))))
  .delete("/providers/:id", async (c) => { await service.deleteProvider(c.req.param("id")); return c.json({ success: true }); })
  .post("/providers/:id/test", async (c) => c.json(await service.testProvider(c.req.param("id"))))
  .get("/providers/:id/models", async (c) => c.json(await service.listProviderModels(c.req.param("id"))))
  .get("/threads", async (c) => c.json(await service.listThreads()))
  .post("/threads", zValidator("json", threadCreateSchema), async (c) => c.json(await service.createThread(c.req.valid("json")), 201))
  .get("/threads/:id", async (c) => c.json(await service.getThread(c.req.param("id"))))
  .patch("/threads/:id", zValidator("json", renameSchema), async (c) => c.json(await service.renameThread(c.req.param("id"), c.req.valid("json").title)))
  .delete("/threads/:id", async (c) => { await service.deleteThread(c.req.param("id")); return c.json({ success: true }); })
  .post("/threads/:id/cancel", async (c) => {
    const active = activeTurns.get(c.req.param("id"));
    if (!active) return c.json({ success: false, message: "No active turn" }, 409);
    active.abort(new Error("Cancelled by client"));
    return c.json({ success: true });
  })
  .post("/threads/:id/messages", zValidator("json", messageSchema), async (c) => {
    const threadId = c.req.param("id");
    if (activeTurns.has(threadId)) throw new AppError(409, "A message is already being generated for this thread", "Wait for the current turn to finish or cancel it first.");
    const body = c.req.valid("json");
    const controller = new AbortController();
    activeTurns.set(threadId, controller);
    let thread: Awaited<ReturnType<typeof service.getThread>>;
    try { thread = await service.getThread(threadId); }
    catch (error) { activeTurns.delete(threadId); throw error; }
    const abortOnDisconnect = () => controller.abort(new Error("Client disconnected"));
    c.req.raw.signal.addEventListener("abort", abortOnDisconnect, { once: true });
    return streamSSE(c, async (stream) => {
      let writes = Promise.resolve();
      try {
        await service.runTurn(threadId, body.text, body.databaseId ?? thread.thread.databaseId, controller.signal, (event) => {
          writes = writes.then(() => stream.writeSSE({ data: JSON.stringify(event) }));
        });
        await writes;
      } finally {
        c.req.raw.signal.removeEventListener("abort", abortOnDisconnect);
        activeTurns.delete(threadId);
        await stream.close();
      }
    }, async (_error, stream) => {
      if (!controller.signal.aborted) await stream.writeSSE({ data: JSON.stringify({ type: "error", message: "The analyst stream failed", hint: "Retry the message or check the provider configuration." }) });
    });
  })
  .get("/results/:resultId", async (c) => {
    const result = getResult(c.req.param("resultId"));
    if (!result) throw new NotFoundError("Analyst result", c.req.param("resultId"), "Results are temporary and may be evicted when the result store reaches its size limit.");
    return c.json(result);
  });

export function activeTurnCount(): number { return activeTurns.size; }
export function cancelAllTurns(): void { for (const turn of activeTurns.values()) turn.abort(); activeTurns.clear(); }
