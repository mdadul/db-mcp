import type { AnalystEvent } from "./types";

export async function* parseAnalystEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<AnalystEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary = findFrameBoundary(buffer);
      while (boundary) {
        const frame = buffer.slice(0, boundary.index).replace(/\r/g, "");
        buffer = buffer.slice(boundary.index + boundary.length);
        const payload = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (payload) {
          let parsed: unknown;
          try { parsed = JSON.parse(payload); } catch { parsed = null; }
          const event = normalizeEvent(parsed);
          if (event) yield event;
        }
        boundary = findFrameBoundary(buffer);
      }
      if (done) break;
    }
    const remaining = buffer.trim();
    if (remaining.startsWith("data:")) {
      let parsed: unknown;
      try { parsed = JSON.parse(remaining.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")); } catch { parsed = null; }
      const event = normalizeEvent(parsed);
      if (event) yield event;
    }
  } finally { reader.releaseLock(); }
}

function findFrameBoundary(buffer: string): { index: number; length: number } | null {
  const match = /\r?\n\r?\n/.exec(buffer);
  return match && match.index !== undefined ? { index: match.index, length: match[0].length } : null;
}

function normalizeEvent(value: unknown): AnalystEvent | null {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") return null;
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case "message.start": return typeof record.messageId === "string" ? { type: record.type, messageId: record.messageId } : null;
    case "text.delta": return typeof record.text === "string" ? { type: record.type, text: record.text } : null;
    case "tool.call": return typeof record.toolCallId === "string" && typeof record.toolName === "string" ? { type: record.type, toolCallId: record.toolCallId, toolName: record.toolName, args: record.args } : null;
    case "tool.result": return typeof record.toolCallId === "string" && typeof record.ok === "boolean" && typeof record.summary === "string" ? { type: record.type, toolCallId: record.toolCallId, ok: record.ok, summary: record.summary, ...(typeof record.rowCount === "number" ? { rowCount: record.rowCount } : {}), ...(typeof record.resultId === "string" ? { resultId: record.resultId } : {}), ...(typeof record.error === "string" ? { error: record.error } : {}) } : null;
    case "artifact.created": return typeof record.artifactId === "string" && (record.kind === "chart" || record.kind === "table") && typeof record.title === "string" && typeof record.resultId === "string" ? { type: record.type, artifactId: record.artifactId, kind: record.kind, title: record.title, resultId: record.resultId } : null;
    case "usage": return typeof record.inputTokens === "number" && typeof record.outputTokens === "number" ? { type: record.type, inputTokens: record.inputTokens, outputTokens: record.outputTokens } : null;
    case "error": return typeof record.message === "string" && typeof record.hint === "string" ? { type: record.type, message: record.message, hint: record.hint } : null;
    case "turn.done": return typeof record.messageId === "string" && typeof record.finishReason === "string" ? { type: record.type, messageId: record.messageId, finishReason: record.finishReason } : null;
    default: return null;
  }
}
