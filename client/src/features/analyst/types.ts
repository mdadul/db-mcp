export type ProviderKind = "anthropic" | "openai" | "openai-compatible";

export interface AnalystProvider {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  defaultModel: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalystThread {
  id: string;
  title: string;
  providerId: string;
  model: string;
  databaseId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalystMessage {
  id: string;
  threadId: string;
  role: string;
  content: unknown;
  createdAt: string;
  usage: unknown;
}

export interface ThreadDetail {
  thread: AnalystThread;
  messages: AnalystMessage[];
  artifacts: AnalystArtifact[];
}

export interface AnalystArtifact {
  id: string;
  threadId: string;
  messageId: string;
  kind: "chart" | "table";
  title: string;
  resultId: string;
  spec: unknown;
  createdAt: string;
}

export interface AnalystArtifactData {
  artifact: AnalystArtifact;
  columns: { name: string }[];
  rows: Record<string, unknown>[];
  truncated: boolean;
}

export interface AnalystPlaybook {
  id: string;
  title: string;
  description: string;
  promptTemplate: string;
}

export type AnalystEvent =
  | { type: "message.start"; messageId: string }
  | { type: "text.delta"; text: string }
  | { type: "tool.call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool.result"; toolCallId: string; ok: boolean; summary: string; rowCount?: number; resultId?: string; error?: string }
  | { type: "artifact.created"; artifactId: string; kind: "chart" | "table"; title: string; resultId: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "error"; message: string; hint: string }
  | { type: "turn.done"; messageId: string; finishReason: string };

export interface AnalystResult {
  resultId: string;
  threadId: string;
  columns: { name: string }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}
