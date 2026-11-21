# db-mcp Desktop (Tauri 2) — Plan & Contracts

Branch: `feat/desktop-tauri`. This file is the single source of truth for every
contributor (human or agent) working on the desktop app. If you need to change a
contract below, change it here first.

## Decisions

| # | Decision |
|---|---|
| D1 | Desktop-only product. Docker/server-mode artifacts are removed in the final cleanup phase. |
| D2 | MCP bearer token (`MCP_TOKEN`) is removed. `/mcp` is protected by loopback binding + Host allowlist + Origin rejection. |
| D3 | UI is bundled in the Tauri app (`tauri://localhost`), not served by the backend. |
| D4 | Backend runs unchanged in logic as a Node 24 sidecar (bundled Node binary + esbuild bundle). |
| D5 | macOS ships separate arm64 and x64 builds (no universal binary — native `.node` modules make lipo fragile). |
| D6 | Code signing is configured via CI secrets; unsigned builds must still work. |
| D7 | Schema browser is out of scope for v1. |
| D8 | Close window → hide to tray. Quit (tray/menu) → stop sidecar. Autostart optional. OS background service is out of scope for v1. |

## Architecture

```
Tauri shell (Rust, desktop/src-tauri)
 ├─ Sidecar supervisor: spawn Node, health-check, restart w/ backoff, stop
 ├─ Secrets: ENCRYPTION_KEY in OS keychain (keyring crate), 0600 file fallback
 ├─ Plugins: single-instance, autostart, updater, window-state, log, opener, dialog
 ├─ Tray: status, Open, Restart server, Open logs, Quit
 └─ IPC commands/events (contract below)
UI (client/, bundled; loaded from tauri://localhost or http://tauri.localhost on Windows)
 └─ HTTP → http://127.0.0.1:<port>/api  with header X-App-Session
Sidecar (Node 24 + desktop/src-tauri/resources/server/index.mjs)
 ├─ /api  → CORS allowlist + X-App-Session
 └─ /mcp  → no auth; Host allowlist; browser Origins rejected
```

Paths (resolved by the shell via Tauri path API):
- SQLite: `app_data_dir/db-mcp.sqlite`
- Logs: `app_log_dir/server.log` (rotated by shell, 5 MB x 3)
- Settings: `app_config_dir/settings.json`

## Contract 1 — Backend environment

| Var | Default | Meaning |
|---|---|---|
| `HOST` | `127.0.0.1` | Bind address. |
| `PORT` | `4080` | Bind port. |
| `DATABASE_PATH` | `./data/db-mcp.sqlite` | Control-plane SQLite path. |
| `ENCRYPTION_KEY` | — (required) | 64 hex chars. |
| `APP_SESSION_TOKEN` | unset | If set, every `/api/*` request except `GET /api/health` must send `X-App-Session: <token>` (timing-safe compare) → else 401 JSON `{ error, hint }`. If unset (local dev), the check is skipped. |
| `ALLOWED_ORIGINS` | unset | Comma-separated extra browser origins allowed on `/api` (dev: `http://localhost:5173`). |

Built-in allowed `/api` origins: `tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost`.

### Request guards (all routes)
- **Host allowlist**: `Host` header must be `127.0.0.1:<PORT>`, `localhost:<PORT>` or `[::1]:<PORT>` → else 403 `{ error, hint }`. (Blocks DNS rebinding.)
- **`/mcp`**: if an `Origin` header is present → 403. MCP clients are not browsers and send no Origin.
- **`/api`**: if `Origin` present and not allowed → 403. CORS response headers only for allowed origins; preflight (`OPTIONS`) handled; allow header `X-App-Session`, `Content-Type`.

### Health
`GET /api/health` → `200 { "status": "ok", "app": "db-mcp", "version": "<package.json version>", "pid": <number> }`.
No session required. The shell uses `app === "db-mcp"` to recognise its own server on a port.

### Lifecycle
- On `SIGTERM`, `SIGINT`, or **stdin `end`/`close`** (parent died): stop accepting connections, close external DB pools, close SQLite, exit 0 within 5 s (force exit after).
- Logs go to stderr. Never log credentials.

## Contract 2 — Tauri IPC (commands invoked by the UI)

All commands return `Result<T, String>`; errors are human-readable.

```ts
type ServerState =
  | "starting" | "healthy" | "unhealthy" | "restarting"
  | "stopped" | "failed" | "port_in_use";

interface ServerInfo {
  state: ServerState;
  port: number;
  baseUrl: string;        // e.g. "http://127.0.0.1:4080"
  mcpUrl: string;         // e.g. "http://127.0.0.1:4080/mcp"
  sessionToken: string;   // X-App-Session value
  version: string | null; // backend version from /api/health
  lastError: string | null;
  restarts: number;
}

interface AppSettings {
  port: number;            // default 4080
  launchAtLogin: boolean;  // default false
  startHidden: boolean;    // default true (only applies on autostart)
  closeToTray: boolean;    // default true
  theme: "system" | "light" | "dark"; // default "system"
  onboardingCompleted: boolean;       // default false
}

interface AiClient {
  id: "claude-desktop" | "claude-code" | "cursor" | "vscode" | "windsurf" | "lm-studio";
  name: string;
  detected: boolean;        // app/config dir exists
  configured: boolean;      // config already contains our "db-mcp" server entry
  configPath: string | null;
  autoInstall: boolean;     // false → UI shows copyable snippet only
  snippet: string;          // manual config snippet for this client
}

interface InstallPreview { configPath: string; before: string; after: string; }
interface InstallResult  { configPath: string; backupPath: string | null; }
```

| Command | Args | Returns |
|---|---|---|
| `get_server_info` | — | `ServerInfo` |
| `restart_server` | — | `ServerInfo` |
| `read_server_logs` | `{ lines: number }` | `string[]` |
| `open_logs_dir` | — | `void` |
| `get_settings` | — | `AppSettings` |
| `update_settings` | `{ patch: Partial<AppSettings> }` | `AppSettings` (port change restarts server) |
| `get_app_info` | — | `{ version: string; platform: "macos"\|"windows"\|"linux" }` |
| `list_ai_clients` | — | `AiClient[]` |
| `preview_ai_client_install` | `{ id }` | `InstallPreview` |
| `install_ai_client` | `{ id }` | `InstallResult` |
| `uninstall_ai_client` | `{ id }` | `InstallResult` |
| `reset_all_data` | — | `void` (stops server, deletes SQLite + keychain entry, restarts) |

Events (shell → UI):
- `server://state` — payload `ServerInfo`, emitted on every state change.

MCP server entry written into AI-client configs uses the name `db-mcp` and URL
`ServerInfo.mcpUrl`, e.g. for Claude Desktop / Cursor:

```json
{ "mcpServers": { "db-mcp": { "url": "http://127.0.0.1:4080/mcp" } } }
```
(Claude Desktop only supports stdio in some versions; its snippet uses
`npx -y mcp-remote http://127.0.0.1:4080/mcp`.)

## Contract 3 — UI platform adapter

`client/src/platform/` exposes one interface used by the whole UI. Two implementations:
- `tauri.ts` — real IPC via `@tauri-apps/api` (`invoke`, `listen`).
- `browser.ts` — dev/browser fallback: `baseUrl = ""` (Vite proxy), no session token,
  server always `healthy`, settings in `localStorage`, AI clients return static snippets.

Selected at runtime via `"__TAURI_INTERNALS__" in window`.

## Phases & owners

| Phase | Scope | Area |
|---|---|---|
| 1 | Backend guards, token removal, health, shutdown | `src/` |
| 2a | Tauri scaffold + sidecar bundling | `desktop/`, `scripts/build-sidecar.mjs` |
| 2b | Shell core: supervisor, secrets, tray, settings, IPC | `desktop/src-tauri/src/` |
| 2c | AI client installer module | `desktop/src-tauri/src/ai_clients.rs` |
| 4a | UI foundations: layout, platform adapter, data layer, theme, server-state screens | `client/` |
| 4b | UI pages: Connections, AI Clients, Activity, Settings, Onboarding | `client/src/pages`, `client/src/features` |
| 6 | CI release workflow (matrix build, signing hooks, updater manifest) | `.github/workflows/` |
| 7 | Docs + Docker removal | README, CLAUDE.md, Dockerfile, compose, setup.sh |
