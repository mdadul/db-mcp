import { tauriPlatform } from "./tauri";
import type { Platform } from "./types";

export type * from "./types";

const previewPlatform = import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)
  ? import("./devPreview").then(({ devPreviewPlatform }) => devPreviewPlatform)
  : Promise.resolve(tauriPlatform);

/** Platform facade that resolves the dev-only browser preview lazily. */
export const platform: Platform = {
  getServerInfo: async () => (await previewPlatform).getServerInfo(),
  restartServer: async () => (await previewPlatform).restartServer(),
  readServerLogs: async (lines) => (await previewPlatform).readServerLogs(lines),
  openLogsDir: async () => (await previewPlatform).openLogsDir(),
  getSettings: async () => (await previewPlatform).getSettings(),
  updateSettings: async (patch) => (await previewPlatform).updateSettings(patch),
  listCustomThemes: async () => (await previewPlatform).listCustomThemes(),
  installCustomTheme: async (json) => (await previewPlatform).installCustomTheme(json),
  deleteCustomTheme: async (id) => (await previewPlatform).deleteCustomTheme(id),
  getAppInfo: async () => (await previewPlatform).getAppInfo(),
  listAiClients: async () => (await previewPlatform).listAiClients(),
  revealAiClientConfig: async (id) => (await previewPlatform).revealAiClientConfig(id),
  previewAiClientInstall: async (id) => (await previewPlatform).previewAiClientInstall(id),
  installAiClient: async (id) => (await previewPlatform).installAiClient(id),
  uninstallAiClient: async (id) => (await previewPlatform).uninstallAiClient(id),
  resetAllData: async () => (await previewPlatform).resetAllData(),
  onServerState: async (callback) => (await previewPlatform).onServerState(callback),
};
