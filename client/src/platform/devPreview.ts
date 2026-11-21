import type { AiClient, AppInfo, AppSettings, Platform, ServerInfo } from "./types";

const SETTINGS_KEY = "dbmcp.settingsCache";
const defaults: AppSettings = {
  port: 4080,
  launchAtLogin: false,
  startHidden: true,
  closeToTray: true,
  theme: "system",
  themeId: "default",
  accent: "blue",
  density: "default",
  fontSize: 13,
  onboardingCompleted: true,
};

const sampleClients: AiClient[] = [
  { id: "claude-desktop", name: "Claude Desktop", detected: true, configured: false, configPath: "~/Library/Application Support/Claude/claude_desktop_config.json", autoInstall: true, snippet: "{\"mcpServers\":{\"db-mcp\":{\"url\":\"http://127.0.0.1:4080/mcp\"}}}" },
  { id: "cursor", name: "Cursor", detected: true, configured: true, configPath: "~/.cursor/mcp.json", autoInstall: true, snippet: "{\"mcpServers\":{\"db-mcp\":{\"url\":\"http://127.0.0.1:4080/mcp\"}}}" },
  { id: "vscode", name: "Visual Studio Code", detected: false, configured: false, configPath: null, autoInstall: false, snippet: "{\"servers\":{\"db-mcp\":{\"url\":\"http://127.0.0.1:4080/mcp\"}}}" },
];

function readSettings(): AppSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (typeof stored !== "object" || stored === null) return defaults;
    const candidate = stored as Partial<AppSettings>;
    return { ...defaults, ...candidate };
  } catch {
    return defaults;
  }
}

/** Browser-only development adapter; dynamically loaded only outside Tauri in DEV builds. */
export const devPreviewPlatform: Platform = {
  async getServerInfo() {
    const port = Number(import.meta.env.VITE_DEV_BACKEND_PORT ?? 4080);
    const baseUrl = `http://127.0.0.1:${port}`;
    return { state: "healthy", port, baseUrl, mcpUrl: `${baseUrl}/mcp`, sessionToken: import.meta.env.VITE_DEV_SESSION_TOKEN ?? "dev", version: "0.1.0", lastError: null, restarts: 0 } satisfies ServerInfo;
  },
  async restartServer() { return this.getServerInfo(); },
  async readServerLogs(lines) {
    const samples = ["2026-11-21T09:10:08.112Z INFO  Sidecar started on 127.0.0.1:4080", "2026-11-21T09:10:08.126Z INFO  SQLite control plane ready", "2026-11-21T09:10:08.128Z INFO  MCP endpoint available at /mcp"];
    return samples.slice(-lines);
  },
  async openLogsDir() {},
  async getSettings() { return readSettings(); },
  async updateSettings(patch) {
    const updated = { ...readSettings(), ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  },
  async listCustomThemes() { return JSON.parse(localStorage.getItem("dbmcp.customThemes") ?? "[]") as string[]; },
  async installCustomTheme(json) {
    const themes = await this.listCustomThemes();
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || !("id" in parsed) || typeof parsed.id !== "string") throw new Error("Theme JSON must have an id.");
    const updated = [...themes.filter((item) => { try { return (JSON.parse(item) as { id?: string }).id !== parsed.id; } catch { return true; } }), json];
    localStorage.setItem("dbmcp.customThemes", JSON.stringify(updated));
    return parsed.id;
  },
  async deleteCustomTheme(id) {
    const themes = await this.listCustomThemes();
    localStorage.setItem("dbmcp.customThemes", JSON.stringify(themes.filter((item) => { try { return (JSON.parse(item) as { id?: string }).id !== id; } catch { return true; } })));
  },
  async getAppInfo() { return { version: "0.1.0", platform: "macos" } satisfies AppInfo; },
  async listAiClients() { return sampleClients; },
  async previewAiClientInstall(id) { return { configPath: sampleClients.find((client) => client.id === id)?.configPath ?? "~/.config/ai-client/config.json", before: "{}", after: "{\"mcpServers\":{\"db-mcp\":{\"url\":\"http://127.0.0.1:4080/mcp\"}}}" }; },
  async installAiClient(id) { return { configPath: sampleClients.find((client) => client.id === id)?.configPath ?? "~/.config/ai-client/config.json", backupPath: null }; },
  async uninstallAiClient(id) { return { configPath: sampleClients.find((client) => client.id === id)?.configPath ?? "~/.config/ai-client/config.json", backupPath: null }; },
  async resetAllData() { localStorage.removeItem(SETTINGS_KEY); },
  async onServerState() { return () => undefined; },
};
