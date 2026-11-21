import { hc } from "hono/client";
import type { AppType } from "@server/app.ts";
import type { ServerInfo } from "@/platform/types";
import { platform } from "@/platform";

export function createApiClient(serverInfo: ServerInfo) {
  return hc<AppType>(serverInfo.baseUrl, {
    headers: (): Record<string, string> => {
      const headers: Record<string, string> = {};
      if (serverInfo.sessionToken) headers["X-App-Session"] = serverInfo.sessionToken;
      return headers;
    },
  });
}

export async function getApiClient() {
  return createApiClient(await platform.getServerInfo());
}
