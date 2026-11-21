# Backlog

Remaining features and tasks for the DB MCP desktop app. This file is the
tracker; no GitHub issues are used. Mark items done by moving them to the
"Done" section with the commit hash.

Priority: **P1** next, **P2** before public release, **P3** later.

---

## P1 — Analyst: use the user's signed-in local agents (OpenCode, Claude Code)

The analyst currently only supports API-key providers. Use the agents already
installed and signed in on the computer first, with no login inside the app.
See `docs/roadmap-themes-and-analyst.md`, decision 0.

- Shared adapter interface for local agents mapped to the existing SSE events
  (`text.delta`, `tool.call`, `tool.result`, `artifact.created`, `turn.done`).
- **OpenCode**: app-owned `opencode serve` on 127.0.0.1 with an app-owned config
  (never edit the user's config). A `db-analyst` agent denies every built-in tool
  and allows only the analyst tools. The model picker lists the user's signed-in models.
- **Claude Code**: Claude Agent SDK with the user's existing local login,
  `tools: []`, `strictMcpConfig: true`, `settingSources: []`,
  `permissionMode: "dontAsk"`. The app never reads or stores credentials.
- Analyst tools served on a per-session MCP endpoint with a random token.
- Check the effective tool list before the first prompt; refuse to start if any
  other tool is available.
- Detection (installed, version, signed in); if not signed in, show the terminal
  command (`claude auth login`, `opencode auth login`).
- Local agents listed first in the picker; API-key providers stay as a fallback.

Done when a chat runs end to end through OpenCode and Claude Code, tests cover the
fail-closed tool check, event mapping and cancel, and the Claude terms risk is shown
in the provider setup UI.

## P1 — UX polish M1 (from `docs/ux-plan.md` sections 8–9)

- Filled-button contrast: dark text on light accents or darker accent (WCAG AA).
- Icon rail (56px) for app navigation on Connections and Analyst; remove the
  full-row "Collapse sidebar".
- Name spelled **DB MCP** everywhere in the UI; new tagline; logo mark and icons.
- Connections: one add action per context; home view when nothing is selected
  (recent tables/queries, health); status dot only after a test; SVG engine logos;
  `database · host` secondary line.
- Analyst: one Providers entry; collapse empty chat list.
- AI Clients: real logos; success style for Connected; Remove, Copy path and Reveal
  in a row menu; show the MCP URL once plus JSON.
- Activity: status badge only for errors; hide empty duration/rows; show the client
  name; capitalised filter labels; error-rate card links to filtered errors.
- Settings: disabled switches show their real state; replace the two close-behaviour
  toggles with one choice (Quit / Keep in menu bar / Keep only the MCP server running).
- Remove duplicate page titles and duplicated explanations.

## P1 — Settings: font family and font size

Settings → Appearance → Text.

- `fontSize` 11–16 (default 13), replacing 12/13/14; migrate existing values.
- `uiFont`: `system`, `inter`, `ibm-plex-sans`, `source-sans-3`,
  `atkinson-hyperlegible`, or `custom` + `uiFontCustom`.
- `codeFont`: `system-mono`, `jetbrains-mono`, `fira-code`, `ibm-plex-mono`,
  `source-code-pro`, or `custom` + `codeFontCustom`.
- `codeFontSize` 11–18 (default 12) for SQL editor, data grid, code blocks, logs.
- `codeLigatures` (default off). Validate in Rust `settings.rs` and with zod.
- Fonts load lazily, only when selected. The `@fontsource` packages are already in
  `client/package.json` (uncommitted in the working tree).
- Custom font not installed → "Not installed on this computer — using the system font".
- ⌘+ / ⌘− / ⌘0 adjust or reset the interface size. Applied before first paint.
- Live preview in Settings.
- Replace the ~160 hard-coded `text-[11px]`…`text-[15px]` classes in `client/src`
  with size tokens based on `--font-size-base`; row heights grow with font size.

## P1 — Split the 745 kB main client bundle

- Find what is in the shared chunk (visualizer or source-map-explorer).
- Lazy-load CodeMirror, the data grid, cmdk, the chart renderer, Settings-only code.
- Stable vendor chunks via `build.rollupOptions.output.manualChunks`.
- Target: main entry chunk under 300 kB minified, no Vite size warning.

## P1 — Remove web-dashboard wording from MCP tool hints

AI clients see these strings:
- `src/mcp/tools/listDatabases.ts:21` — "Add one through the web dashboard."
- `src/mcp/tools/getDatabaseSchema.ts:13`, `src/mcp/tools/getTableSchema.ts:16` —
  "Enable the database in the dashboard…"

Point them at the desktop app (DB MCP → Connections). Grep for other "dashboard" or
"Docker" wording in user- or agent-facing strings.

## P2 — First pre-release

The release workflow (`.github/workflows/release.yml`) has never run.
1. Push the branch and run it manually.
2. Fix failures on macOS arm64, macOS x64, Windows x64, Ubuntu 22.04 (Windows and
   Linux sidecar builds have never run).
3. Install each artifact on a clean machine; check the app opens, the backend is
   healthy and an AI client can call `/mcp`.
4. Tag `v0.1.0` as an unsigned pre-release with the README install notes.

## P2 — Enable auto-updates

The updater plugin is behind the `updater` Cargo feature and `pubkey` is empty.
Enable before the first public release.
- `bunx tauri signer generate -w ~/.tauri/db-mcp.key` (private key never in the repo).
- Public key in `tauri.conf.json` → `plugins.updater.pubkey`; private key and password
  as repo secrets (the workflow already exports them).
- Enable the feature and `bundle.createUpdaterArtifacts`; publish `latest.json`.
- Update UI on launch and in Settings → About; stop the sidecar and background
  server before installing.

## P2 — Code signing and notarization

- **macOS**: Developer ID certificate; secrets `APPLE_CERTIFICATE`,
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
  `APPLE_PASSWORD`, `APPLE_TEAM_ID` (already read by the workflow). Confirm the Node
  binary and `.node` addons are signed and notarization passes with the current
  entitlements.
- **Windows**: Azure Trusted Signing or an OV/EV certificate; add the signing step
  (TODO in `release.yml`).

## P2 — Verify the background server on Windows and Linux

macOS is verified on a real install (commit `aa0f143`).
- **Linux**: `systemctl --user` install/enable/restart/disable on Ubuntu and Fedora;
  clear error when `systemd --user` is unavailable; AppImage path stability across updates.
- **Windows**: Task Scheduler XML import, run at log on, restart on failure, delete on
  disable; logoff shutdown and `server.json` cleanup.
- All: Quit keeps MCP answering; reopen attaches without "port in use"; uninstall
  removes the service.

## P2 — Import connections from the previous server version

Old installs keep connections in `./data/db-mcp.sqlite`, encrypted with
`ENCRYPTION_KEY` from `.env`.
- Settings → Data → Import from previous version: pick the SQLite file, give the old
  key (or pick the `.env`).
- Copy connections, re-encrypt with the app key; optionally import query logs.
- Summary (imported, duplicates skipped, failed to decrypt); never overwrite without asking.
- Never log the key or decrypted credentials.

## P2 — Workbench follow-ups

- **SQLite file picker**: Browse button does nothing. Add `@tauri-apps/plugin-dialog`
  with `.sqlite`/`.db`/`.sqlite3` filters and a minimal capability.
- **Persist connection test results**: store `lastTestedAt`, `lastTestStatus`,
  `lastTestError` (migration) and show them in the list.
- **Query log statuses**: record `timeout` and `blocked` separately from `error` so
  the Activity filters work.

## P3 — Analyst: Codex adapter (spike first)

Drive Codex via `codex app-server` with the user's existing sign-in.
- Spike: prove built-in tools can be fully removed and an HTTP MCP server can be set
  per session without editing `~/.codex/config.toml`. If not, don't ship it; record
  the result in the roadmap.
- If it passes: adapter on the shared interface, documented "Sign in with ChatGPT"
  flow only (never reuse stored CLI tokens), fail-closed tool check.
- Needs the Codex CLI installed.

## P3 — Analyst: workbench panel, mentions, reports, AI policy, PII masking

- Analyst side panel in the workbench with the selected connection/table as context.
- `@` mentions for connections, tables and saved results.
- Reports board: pin artifacts; export Markdown + PNG and CSV.
- Per-connection "Allow AI analyst" (off by default for production) and "Ask before
  each query", with approval prompts.
- PII masking for preview rows sent to the model.
- Links in analyst answers open in the system browser, not the app window.

## P3 — Analyst: Antigravity and other ACP agents (blocked)

`agy acp --process-per-session` and other ACP agents via `@agentclientprotocol/sdk`.
Blocked on:
1. Tool limits: not established that ACP agents can be restricted to the analyst
   tools; needs a spike per agent, fail closed.
2. Terms: Gemini CLI prohibits its Google login through third-party software; no
   explicit statement for Antigravity.

## P3 — Distribution

After the first release:
- Homebrew cask in a tap (`brew install --cask db-mcp`) for arm64 and x64.
- winget manifest PR to `microsoft/winget-pkgs`.
- Optional AUR and Flathub.
- README download links per OS.

---

## Done

- Background server (D9) — `aa0f143`, verified on macOS.
- Redshift `get_table_schema` dist key / schema-qualified names — `8becd74`.
