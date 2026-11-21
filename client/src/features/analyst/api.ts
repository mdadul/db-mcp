import { getApiClient } from "@/api/client";
import { unwrap } from "@/api/unwrap";
import { platform } from "@/platform";
import type { AnalystArtifactData, AnalystPlaybook, AnalystProvider, AnalystResult, AnalystThread, ProviderKind, ThreadDetail } from "./types";

export interface ProviderInput {
  kind: ProviderKind;
  name: string;
  baseUrl?: string | null;
  apiKey?: string;
  defaultModel: string;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const info = await platform.getServerInfo();
  const headers = new Headers(init?.headers);
  headers.set("X-App-Session", info.sessionToken);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${info.baseUrl}/api/analyst${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error;
      if (body && typeof body === "object" && "hint" in body && typeof body.hint === "string") message += ` — ${body.hint}`;
    } catch { /* Keep the status message for a non-JSON response. */ }
    throw new Error(message);
  }
  return response;
}

export const analystApi = {
  async providers(): Promise<AnalystProvider[]> { return unwrap<AnalystProvider[]>(await (await getApiClient()).api.analyst.providers.$get()); },
  async createProvider(input: ProviderInput): Promise<AnalystProvider> { return unwrap<AnalystProvider>(await (await getApiClient()).api.analyst.providers.$post({ json: input })); },
  async updateProvider(id: string, input: Partial<ProviderInput>): Promise<AnalystProvider> { return unwrap<AnalystProvider>(await (await getApiClient()).api.analyst.providers[":id"].$patch({ param: { id }, json: input })); },
  async deleteProvider(id: string): Promise<void> { await unwrap<void>(await (await getApiClient()).api.analyst.providers[":id"].$delete({ param: { id } })); },
  async testProvider(id: string): Promise<{ success: boolean; message: string; latencyMs: number }> { return unwrap(await (await getApiClient()).api.analyst.providers[":id"].test.$post({ param: { id } })); },
  async models(id: string): Promise<{ models: string[]; source: "remote" | "fallback" }> { return unwrap(await (await getApiClient()).api.analyst.providers[":id"].models.$get({ param: { id } })); },
  async threads(): Promise<AnalystThread[]> { return unwrap<AnalystThread[]>(await (await getApiClient()).api.analyst.threads.$get()); },
  async thread(id: string): Promise<ThreadDetail> { return unwrap<ThreadDetail>(await (await getApiClient()).api.analyst.threads[":id"].$get({ param: { id } })); },
  async createThread(input: { providerId: string; model: string; databaseId: string | null }): Promise<AnalystThread> { return unwrap<AnalystThread>(await (await getApiClient()).api.analyst.threads.$post({ json: input })); },
  async renameThread(id: string, title: string): Promise<AnalystThread> { return unwrap<AnalystThread>(await (await getApiClient()).api.analyst.threads[":id"].$patch({ param: { id }, json: { title } })); },
  async updateThread(id: string, input: { providerId?: string; model?: string }): Promise<AnalystThread> { return unwrap<AnalystThread>(await (await getApiClient()).api.analyst.threads[":id"].$patch({ param: { id }, json: input })); },
  async deleteThread(id: string): Promise<void> { await unwrap<void>(await (await getApiClient()).api.analyst.threads[":id"].$delete({ param: { id } })); },
  async cancel(id: string): Promise<void> { await request(`/threads/${encodeURIComponent(id)}/cancel`, { method: "POST" }); },
  async result(id: string): Promise<AnalystResult> { return unwrap<AnalystResult>(await request(`/results/${encodeURIComponent(id)}`)); },
  async artifact(id: string): Promise<AnalystArtifactData> { return unwrap<AnalystArtifactData>(await request(`/artifacts/${encodeURIComponent(id)}`)); },
  async playbooks(): Promise<AnalystPlaybook[]> { return unwrap<AnalystPlaybook[]>(await (await getApiClient()).api.analyst.playbooks.$get()); },
  async stream(id: string, text: string, databaseId: string | null, signal: AbortSignal): Promise<Response> {
    return request(`/threads/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ text, databaseId }), signal });
  },
};
