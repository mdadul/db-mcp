export type ServerState =
  | "starting"
  | "healthy"
  | "unhealthy"
  | "restarting"
  | "stopped"
  | "failed"
  | "port_in_use";

export interface ServerInfo {
  state: ServerState;
  port: number;
  baseUrl: string;
  mcpUrl: string;
  sessionToken: string;
  version: string | null;
  lastError: string | null;
  restarts: number;
}

export interface AppSettings {
  port: number;
  launchAtLogin: boolean;
  startHidden: boolean;
  closeToTray: boolean;
  theme: "system" | "light" | "dark";
  onboardingCompleted: boolean;
}

export type AiClientId =
  | "claude-desktop"
  | "claude-code"
  | "cursor"
  | "vscode"
  | "windsurf"
  | "lm-studio";

export interface AiClient {
  id: AiClientId;
  name: string;
  detected: boolean;
  configured: boolean;
  configPath: string | null;
  autoInstall: boolean;
  snippet: string;
}

export interface InstallPreview {
  configPath: string;
  before: string;
  after: string;
}

export interface InstallResult {
  configPath: string;
  backupPath: string | null;
}

export interface AppInfo {
  version: string;
  platform: "macos" | "windows" | "linux";
}

export interface Platform {
  getServerInfo(): Promise<ServerInfo>;
  restartServer(): Promise<ServerInfo>;
  readServerLogs(lines: number): Promise<string[]>;
  openLogsDir(): Promise<void>;
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  getAppInfo(): Promise<AppInfo>;
  listAiClients(): Promise<AiClient[]>;
  previewAiClientInstall(id: AiClientId): Promise<InstallPreview>;
  installAiClient(id: AiClientId): Promise<InstallResult>;
  uninstallAiClient(id: AiClientId): Promise<InstallResult>;
  resetAllData(): Promise<void>;
  onServerState(callback: (info: ServerInfo) => void): Promise<() => void>;
}
