# Roadmap: theme system and Data Analyst chat

Status: planned. Builds on the design system from the UI overhaul (semantic
tokens, `data-theme`, `data-accent`, density variables). Nothing here is built yet.

## Part 1: Theme system

### What the user gets
- **Settings → Appearance → Theme**: a gallery of theme cards, each a small live
  preview (sidebar, toolbar, table rows, a chart). Click to apply instantly.
- Built-in themes (each with light and dark variants where it makes sense):
  Default, Graphite, Nord, Solarized, GitHub, Catppuccin, Dracula (dark only),
  Rosé Pine, High Contrast (light and dark, WCAG AAA text).
- **Mode**: Light / Dark / System. A theme with both variants follows the mode;
  a dark-only theme forces dark.
- **Accent** (already planned): applies on top of any theme that allows it.
- **Density**: Compact / Default / Comfortable (control height, row height, font size).
- **Interface font size**: 12 / 13 / 14 px. **Code font**: system mono or a chosen installed font.
- **Import theme**: drop a `.json` theme file; validate, preview, then install.
  **Export** the current theme as a starting point.

### How it works
- A theme is a JSON document validated by a zod schema:
  ```json
  {
    "id": "nord", "name": "Nord", "author": "…", "version": 1,
    "variants": {
      "dark":  { "tokens": { "background": "oklch(...)", "surface": "...", "...": "..." },
                 "chart": ["#88c0d0", "..."], "syntax": { "keyword": "...", "string": "..." } },
      "light": { "tokens": { "...": "..." } }
    },
    "allowsAccent": true
  }
  ```
- Token set = the semantic tokens from the design system (background, surface,
  surface-raised, sidebar, border, text, text-muted, accent, success, warning,
  danger, info, focus-ring, …) plus **chart palette** (used by the analyst charts)
  and **syntax colors** (SQL editor, code blocks).
- At runtime the app writes the selected variant's tokens into a single
  `<style id="theme">` as CSS variables on `:root`, and sets `data-theme`,
  `data-mode`, `data-accent`, `data-density`. Built-in themes ship as JSON in the
  client bundle; imported themes are stored in `app_config_dir/themes/*.json`.
- Applied before first paint from a cached copy (no flash), then reconciled with settings.
- Contrast check on import: warn when text/background pairs fail WCAG AA.
- Settings: `theme: string` (theme id), `mode`, `accent`, `density`, `fontSize`, `codeFont`.

### Rules for all UI code (enforced now)
No hard-coded palette colors in components. Everything uses semantic tokens, so any
theme works without touching components.

---

## Part 2: Data Analyst chat

A built-in chat where the user talks to an AI agent that acts as a **data
analyst / data engineer** over their connected databases: explores schemas, writes
and runs read-only queries, profiles data, explains results, and renders charts.
It uses the **AI agents the user already has and is signed in to** (Claude Code,
Codex, OpenCode, Gemini CLI, …), the same way T3 Code does: the app drives the
agent installed on the user's machine and never resells tokens or handles the
user's provider credentials.

### How T3 Code does it (the model we follow)
- Runs the agents locally and gives them one interface; "if an agent is set up on
  your computer, T3 Code can control it".
- Provider-specific behavior lives behind an **adapter**; the rest of the app works
  with normalized commands and events, so adding a provider doesn't spread
  branches through the code.
- Supports any **ACP** (Agent Client Protocol) agent in addition to dedicated adapters.

### Architecture

```
UI (chat panel / Analyst page)
   │  Tauri IPC + events (stream of normalized events)
   ▼
Node sidecar: Analyst service
   ├─ ProviderAdapter (one per agent)  ── spawns / talks to the local agent
   │    claude   → Claude Agent SDK, using the user's installed Claude Code login
   │    codex    → `codex app-server` (JSON-RPC over stdio)
   │    opencode → `opencode serve` HTTP API / SDK
   │    acp      → any ACP agent over stdio (Gemini CLI, others, and agents that ship ACP adapters)
   │    local    → OpenAI-compatible endpoint (Ollama, LM Studio) for fully offline use
   ├─ Session store (SQLite): threads, messages, tool calls, artifacts
   └─ Analyst toolset = our existing MCP server (/mcp) + analyst-only tools
```

Normalized events: `message.delta`, `message.done`, `tool.call`, `tool.result`,
`approval.request`, `artifact.created`, `usage`, `error`, `turn.done`.

### Provider detection and setup
- **AI Providers** settings page: detects installed CLIs (`claude`, `codex`,
  `opencode`, `gemini`, ACP agents in PATH), shows version and signed-in state,
  and gives the exact command to install or sign in (`claude auth login`,
  `codex login`, …). The app never asks for or stores the provider's tokens.
- Optional: API-key providers (Anthropic, OpenAI) and local endpoints (Ollama,
  LM Studio) for users without a CLI subscription. Keys stored in the OS keychain.
- Model and reasoning-effort picker per thread, from what the provider reports.

### The analyst harness
- **System prompt / persona**: senior data analyst and data engineer. Workflow:
  understand the question → find relevant tables (schema tools) → state
  assumptions → write small, targeted read-only queries → validate (row counts,
  nulls, duplicates, date ranges) → summarize findings with numbers → chart when it
  helps → list caveats and next questions.
- **Tools the agent gets** (MCP, served by our backend):
  - existing: `list_databases`, `get_database_schema`, `get_table_schema`, `execute_read_query`
  - new analyst tools:
    - `run_query` → stores the full result server-side and returns `result_id`,
      columns, row count and a small preview (keeps large data out of the model context)
    - `profile_table` / `profile_result` → per-column stats (null %, distinct, min/max, top values, histograms)
    - `render_chart({ result_id, spec })` → declarative chart spec (Vega-Lite subset);
      the UI loads the full result locally and renders it
    - `render_table({ result_id, columns? })`, `create_report({ title, blocks })`
    - `sample_rows`, `explain_query` (EXPLAIN, read-only)
- **Agent built-in tools are disabled**: no shell, no file writes, no web by
  default. Configured per provider (Claude: allowed tools = our MCP only;
  Codex: read-only sandbox, no network; OpenCode: agent permissions; ACP:
  deny permission requests outside our tools).
- **Skills / playbooks** the user can trigger: "Profile this table", "Find
  anomalies", "Trend over time", "Cohort / retention", "Compare two periods",
  "Data quality report", "Explain this query".

### UI
- **Analyst** section in the sidebar (threads list + chat), and a **chat side
  panel** inside the workbench that already knows the selected connection/table.
- Composer: `@` to mention connections, tables and saved results; `/` for playbooks;
  provider + model picker; attach a query result from the workbench.
- Streaming messages with collapsible **tool steps** ("Ran query on prod-orders ·
  42 rows · 120 ms") that show the SQL and open it in the SQL editor in one click.
- **Artifacts** inline: result tables (sortable, copy as CSV), charts (bar, line,
  area, scatter, pie, heatmap; switch type, export PNG/SVG), and reports.
  Artifacts can be pinned to a **Report** board and exported (Markdown + PNG, CSV).
- Approval prompts when policy requires (see below), with "allow for this thread".

### Data safety and privacy
- Every agent query goes through the same path as MCP: `assertReadOnly`, limit
  injection, timeout, read-only DB user recommended. Logged with `source = 'agent'`.
- Per-connection setting **"Allow AI analyst"** (off for connections tagged
  production unless enabled) and **"Ask before each query"**.
- Clear notice per provider: query results you let the agent read are sent to
  that provider. Local providers (Ollama/LM Studio) keep data on the machine.
- Optional **PII masking** of preview rows sent to the model (emails, phones,
  card-like numbers) while the full data stays local for charts.
- Row and byte caps on anything returned to the model; full results stay in the sidecar.

### Decision blockers (verify before building)
1. **Provider terms.** Check each provider's current terms for third-party apps
   that drive the user's own signed-in agent. For example, Anthropic's Agent SDK
   docs have restricted third-party products from offering claude.ai login; T3
   Code avoids this by driving the user's own installed CLI. Confirm the
   approach per provider (Claude, OpenAI Codex, Google) before shipping.
2. **Antigravity.** Confirm it exposes a CLI or ACP interface we can drive; if not,
   support it through ACP later or leave it out.
3. **Chart library.** Vega-Lite (expressive, larger) vs ECharts (fast, large
   datasets) vs a small custom set on top of a light library. Recommendation:
   Vega-Lite spec as the agent-facing format, rendered with vega-embed (lazy-loaded).

### Phases
1. Provider detection + adapters for Claude and Codex, chat UI with streaming,
   tool steps, our MCP tools only, threads persisted.
2. Analyst tools (`run_query` with result store, profiling, charts) and artifacts.
3. OpenCode, ACP, local providers; workbench side panel; `@` mentions; playbooks.
4. Reports board, exports, PII masking, per-connection AI policy and approvals.
