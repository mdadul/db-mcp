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
- **Interface font size**: 12–18 px (default 14). **Code font size**: 11–20 px (default 13), with system mono or a bundled font.
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
It works with AI providers the user already has: API keys, local models, and,
where the provider permits it, agents installed on the user's machine. The app
never resells tokens.

### Integration approach
- Agents and models run locally or through the user's own provider account.
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
   docs have restricted third-party products from offering claude.ai login.
   Confirm the approach per provider (Claude, OpenAI Codex, Google) before shipping.
2. **Antigravity.** Confirm it exposes a CLI or ACP interface we can drive; if not,
   support it through ACP later or leave it out.
3. **Chart library.** Vega-Lite (expressive, larger) vs ECharts (fast, large
   datasets) vs a small custom set on top of a light library. Recommendation:
   Vega-Lite spec as the agent-facing format, rendered with vega-embed (lazy-loaded).

### Research findings and decisions (2026-11-21)

Source: provider research task (official provider documentation). Summary:

| Provider | Drive method | Can restrict to our MCP tools only? | Use of the user's subscription login |
|---|---|---|---|
| Claude | Agent SDK `query()` with inline `mcpServers`, `strictMcpConfig`, `settingSources: []`, `tools: []`, `permissionMode: "dontAsk"` | Yes, documented | Not allowed for third-party apps without Anthropic approval; API key or cloud-provider credentials are fine |
| Codex | `codex app-server` JSON-RPC over stdio | Not confirmed (read-only sandbox is not MCP-only) | Allowed for open-source, locally hosted apps via the documented "Sign in with ChatGPT" flow; never reuse the CLI's stored tokens |
| OpenCode | `opencode serve` + SDK, app-owned config | Yes, with deny-all permissions plus allow-list of our tools | Follows the underlying provider's terms |
| Antigravity | `agy acp --process-per-session` (ACP) | Not established | No explicit Google statement either way |
| Gemini CLI | ACP | Not established | Google-account OAuth through third-party software is prohibited |

Decisions (revised 2026-11-21 after product-owner review):
0. **Use the user's own signed-in agents first, starting with OpenCode.** The
   analyst runs on agents already installed and authenticated on the computer.
   OpenCode is first: the app starts its own `opencode serve` on 127.0.0.1 with an
   app-owned config (the user's OpenCode config is never edited) that defines a
   `db-analyst` agent with every built-in tool denied and only the analyst MCP tools
   allowed. The analyst tools are served by the sidecar on a per-session MCP
   endpoint protected by a random per-session token header. The model picker lists
   the models the user's OpenCode is already signed in to. The adapter checks the
   effective tool list before the first prompt and fails closed. Codex follows
   after the built-in-tool spike. **Claude Code** is driven the same way: the
   Claude Agent SDK reuses the login the user already has in their installed
   Claude Code (the app shows no login screen and never reads or stores
   credentials; usage is billed to the user's own account). Built-in tools are
   removed with `tools: []`, `strictMcpConfig`, `settingSources: []` and
   `permissionMode: "dontAsk"`. If an agent is installed but not signed in, the app
   shows the command to run in a terminal (`claude auth login`, `opencode auth login`).
   Product owner accepted the terms risk noted in the research findings. API-key
   providers stay as a fallback.
1. **Own agent loop (now the fallback).** Phase 1 ships an in-sidecar agent loop whose only
   tools are our analyst tools, with these providers: Anthropic API key, OpenAI API
   key, any OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter, etc.).
   This is fully under our control, MCP-only by construction, and compliant.
2. **Claude Agent SDK adapter** (phase 1b) with API-key auth, configured MCP-only as above.
3. **OpenCode adapter** (phase 3) with an app-owned config and deny-all permissions.
4. **Codex** (phase 3) only after a spike proves built-in tools can be removed, and
   only through the documented Sign in with ChatGPT flow.
5. **Claude subscription login, Antigravity, Gemini CLI:** not shipped until the
   provider confirms in writing; fail closed.
6. Every adapter verifies the effective tool list before the first prompt and
   refuses to start if any tool other than ours is available.

### Phases
1. Own agent loop with Anthropic / OpenAI / OpenAI-compatible (local) providers,
   keys in the OS keychain, chat UI with streaming, tool steps, threads persisted.
2. Analyst tools (`run_query` with result store, profiling, charts) and artifacts.
3. Claude Agent SDK and OpenCode adapters; Codex after the spike; workbench side panel; `@` mentions; playbooks.
4. Reports board, exports, PII masking, per-connection AI policy and approvals.

### Analyst event and artifact contract

- `artifact.created` is emitted in the thread's SSE stream after the artifact has
  been durably saved. Payload: `{ type: "artifact.created", artifactId, kind,
  title, resultId }`, where `kind` is `chart` or `table`.
- `GET /api/analyst/threads/:id` includes `artifacts`, ordered by creation time.
  Artifact metadata is `{ id, threadId, messageId, kind, title, resultId, spec,
  createdAt }`.
- `GET /api/analyst/artifacts/:id` returns `{ artifact, columns, rows,
  truncated }`. The rows are a JSON-safe durable snapshot, capped at 5,000 rows
  and 5 MB; `truncated` is true if the source result was already truncated or
  either snapshot cap was reached. Artifact retrieval remains available after the
  in-memory result store evicts its entry.
- `render_chart` accepts a result reference, title, and restricted Vega-Lite spec.
  Its marks are `bar|line|area|point|arc|rect|tick`; encodings are
  `x|y|color|size|theta|tooltip` with result fields and supported type,
  aggregate, bin, timeUnit, sort, stack, and title options. Data transforms are
  disallowed; SQL must prepare chart data.
- `render_table` accepts a result reference, title, and optional result columns.
  Neither render tool returns row data to the model.
- `profile_result` profiles the complete stored result locally. `profile_table`
  performs a validated read-only sample capped at 10,000 rows and explicitly
  labels the returned profiles as sample-based.
- `GET /api/analyst/playbooks` returns static `{ id, title, description,
  promptTemplate }` entries. Templates may use `{table}` and `{database}`.
