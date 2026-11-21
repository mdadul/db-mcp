import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AiClientId, Platform, ServerInfo } from "./types";

export const tauriPlatform: Platform = {
  getServerInfo: () => invoke("get_server_info"),
  restartServer: () => invoke("restart_server"),
  readServerLogs: (lines) => invoke("read_server_logs", { lines }),
  openLogsDir: () => invoke("open_logs_dir"),
  getSettings: () => invoke("get_settings"),
  updateSettings: (patch) => invoke("update_settings", { patch }),
  listCustomThemes: () => invoke("list_custom_themes"),
  installCustomTheme: (json) => invoke("install_custom_theme", { json }),
  deleteCustomTheme: (id) => invoke("delete_custom_theme", { id }),
  getAppInfo: () => invoke("get_app_info"),
  listAiClients: () => invoke("list_ai_clients"),
  revealAiClientConfig: (id: AiClientId) => invoke("reveal_ai_client_config", { id }),
  previewAiClientInstall: (id: AiClientId) => invoke("preview_ai_client_install", { id }),
  installAiClient: (id: AiClientId) => invoke("install_ai_client", { id }),
  uninstallAiClient: (id: AiClientId) => invoke("uninstall_ai_client", { id }),
  resetAllData: () => invoke("reset_all_data"),
  async onServerState(callback) {
    return listen<ServerInfo>("server://state", (event) => callback(event.payload));
  },
};
