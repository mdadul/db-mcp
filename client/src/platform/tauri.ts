import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

import type { AiClientId, AppUpdate, Platform, ServerInfo, UpdateProgress } from "./types";

let pendingUpdate: Awaited<ReturnType<typeof check>> = null;

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
  async checkForAppUpdate(): Promise<AppUpdate | null> {
    const update = await check();
    if (!update) {
      pendingUpdate?.close();
      pendingUpdate = null;
      return null;
    }
    pendingUpdate?.close();
    pendingUpdate = update;
    return {
      version: update.version,
      currentVersion: update.currentVersion,
      date: update.date ?? null,
      notes: update.body ?? null,
    };
  },
  async installAppUpdate(onProgress: (progress: UpdateProgress) => void) {
    if (!pendingUpdate) throw new Error("Check for updates before installing.");
    const update = pendingUpdate;
    let started = false;
    await update.download((event) => {
      if (event.event === "Started") {
        started = true;
        onProgress({ kind: "started", contentLength: event.data.contentLength ?? null });
      } else if (event.event === "Progress") {
        onProgress({ kind: "progress", chunkLength: event.data.chunkLength });
      } else {
        onProgress({ kind: "finished" });
      }
    });
    if (!started) onProgress({ kind: "finished" });
    try {
      await invoke("prepare_app_update");
      await update.install();
      pendingUpdate = null;
      await relaunch();
    } catch (error: unknown) {
      await invoke("resume_app_after_update").catch(() => undefined);
      throw error;
    }
  },
  listAiClients: () => invoke("list_ai_clients"),
  revealAiClientConfig: (id: AiClientId) => invoke("reveal_ai_client_config", { id }),
  previewAiClientInstall: (id: AiClientId) => invoke("preview_ai_client_install", { id }),
  installAiClient: (id: AiClientId) => invoke("install_ai_client", { id }),
  uninstallAiClient: (id: AiClientId) => invoke("uninstall_ai_client", { id }),
  resetAllData: () => invoke("reset_all_data"),
  getBackgroundServer: () => invoke("get_background_server"),
  setBackgroundServer: (enabled) => invoke("set_background_server", { enabled }),
  restartBackgroundServer: () => invoke("restart_background_server"),
  stopBackgroundServer: () => invoke("stop_background_server"),
  async onServerState(callback) {
    return listen<ServerInfo>("server://state", (event) => callback(event.payload));
  },
};
