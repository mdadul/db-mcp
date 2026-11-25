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
  mode: "embedded" | "background";
  attached: boolean;
  pid: number | null;
}

export interface BackgroundServerStatus {
  enabled: boolean;
  installed: boolean;
  running: boolean;
  pid: number | null;
  port: number | null;
  error: string | null;
}

export const INTERFACE_FONT_SIZES = [12, 13, 14, 15, 16, 17, 18] as const;
export type InterfaceFontSize = (typeof INTERFACE_FONT_SIZES)[number];
export const CODE_FONT_SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;
export type CodeFontSize = (typeof CODE_FONT_SIZES)[number];

export interface AppSettings {
  port: number;
  launchAtLogin: boolean;
  startHidden: boolean;
  closeToTray: boolean;
  theme: "system" | "light" | "dark";
  themeId: string;
  accent: "blue" | "violet" | "green" | "orange" | "pink" | "graphite";
  density: "compact" | "default" | "comfortable";
  fontSize: InterfaceFontSize;
  uiFont:
    | "system"
    | "inter"
    | "ibm-plex-sans"
    | "source-sans-3"
    | "atkinson-hyperlegible"
    | "custom";
  uiFontCustom: string;
  codeFont:
    | "system-mono"
    | "jetbrains-mono"
    | "fira-code"
    | "ibm-plex-mono"
    | "source-code-pro"
    | "custom";
  codeFontCustom: string;
  codeFontSize: CodeFontSize;
  codeLigatures: boolean;
  onboardingCompleted: boolean;
  backgroundServer: boolean;
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
  listCustomThemes(): Promise<string[]>;
  installCustomTheme(json: string): Promise<string>;
  deleteCustomTheme(id: string): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  listAiClients(): Promise<AiClient[]>;
  revealAiClientConfig(id: AiClientId): Promise<void>;
  previewAiClientInstall(id: AiClientId): Promise<InstallPreview>;
  installAiClient(id: AiClientId): Promise<InstallResult>;
  uninstallAiClient(id: AiClientId): Promise<InstallResult>;
  resetAllData(): Promise<void>;
  getBackgroundServer(): Promise<BackgroundServerStatus>;
  setBackgroundServer(enabled: boolean): Promise<BackgroundServerStatus>;
  restartBackgroundServer(): Promise<BackgroundServerStatus>;
  stopBackgroundServer(): Promise<BackgroundServerStatus>;
  onServerState(callback: (info: ServerInfo) => void): Promise<() => void>;
}
