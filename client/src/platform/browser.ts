import type { AiClient, AiClientId, AppInfo, AppSettings, Platform, ServerInfo } from "./types";

const SETTINGS_KEY = "dbmcp.settings";
const DEFAULT_SETTINGS: AppSettings = {
  port: 4080,
  launchAtLogin: false,
  startHidden: true,
  closeToTray: true,
  theme: "system",
  onboardingCompleted: false,
};

const getSettings = (): AppSettings => {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (!saved) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
    const value = parsed as Partial<Record<keyof AppSettings, unknown>>;
    return {
      port: typeof value.port === "number" ? value.port : DEFAULT_SETTINGS.port,
      launchAtLogin: typeof value.launchAtLogin === "boolean" ? value.launchAtLogin : DEFAULT_SETTINGS.launchAtLogin,
      startHidden: typeof value.startHidden === "boolean" ? value.startHidden : DEFAULT_SETTINGS.startHidden,
      closeToTray: typeof value.closeToTray === "boolean" ? value.closeToTray : DEFAULT_SETTINGS.closeToTray,
      theme: value.theme === "light" || value.theme === "dark" || value.theme === "system" ? value.theme : DEFAULT_SETTINGS.theme,
      onboardingCompleted: typeof value.onboardingCompleted === "boolean" ? value.onboardingCompleted : DEFAULT_SETTINGS.onboardingCompleted,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const serverInfo = (): ServerInfo => {
  const { port } = getSettings();
  return {
    state: "healthy",
    port,
    baseUrl: "",
    mcpUrl: `http://127.0.0.1:${port}/mcp`,
    sessionToken: "",
    version: "development",
    lastError: null,
    restarts: 0,
  };
};

const clientNames: AiClient[] = [
  { id: "claude-desktop", name: "Claude Desktop", detected: false, configured: false, configPath: null, autoInstall: false, snippet: "" },
  { id: "claude-code", name: "Claude Code", detected: false, configured: false, configPath: null, autoInstall: false, snippet: "" },
  { id: "cursor", name: "Cursor", detected: false, configured: false, configPath: null, autoInstall: false, snippet: "" },
  { id: "vscode", name: "Visual Studio Code", detected: false, configured: false, configPath: null, autoInstall: false, snippet: "" },
  { id: "windsurf", name: "Windsurf", detected: false, configured: false, configPath: null, autoInstall: false, snippet: "" },
  { id: "lm-studio", name: "LM Studio", detected: false, configured: false, configPath: null, autoInstall: false, snippet: "" },
];

export const browserPlatform: Platform = {
  async getServerInfo() {
    return serverInfo();
  },
  async restartServer() {
    return serverInfo();
  },
  async readServerLogs() {
    return [];
  },
  async openLogsDir() {},
  async getSettings() {
    return getSettings();
  },
  async updateSettings(patch) {
    const updated = { ...getSettings(), ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  },
  async getAppInfo(): Promise<AppInfo> {
    return { version: "development", platform: "linux" };
  },
  async listAiClients() {
    const mcpUrl = serverInfo().mcpUrl;
    return clientNames.map((client) => ({
      ...client,
      snippet: JSON.stringify({ mcpServers: { "db-mcp": { url: mcpUrl } } }, null, 2),
    }));
  },
  async previewAiClientInstall(_id: AiClientId) {
    return { configPath: "", before: "", after: "" };
  },
  async installAiClient(_id: AiClientId) {
    return { configPath: "", backupPath: null };
  },
  async uninstallAiClient(_id: AiClientId) {
    return { configPath: "", backupPath: null };
  },
  async resetAllData() {},
  async onServerState() {
    return () => undefined;
  },
};
