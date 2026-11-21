# UI/UX plan: polished, enterprise-grade desktop app

Owner: design lead. Status: proposal. Tracks into `docs/backlog.md` once agreed.

## 1. Where we are

What's in place: a design system with semantic tokens, themes, a native-style
shell, a three-pane workbench, a rebuilt connection form, an analyst chat, and
onboarding.

What holds it back from feeling enterprise-grade:

- **No visual QA loop.** Layout bugs (grid painting over panes, traffic lights on
  the title, tiny text) were found by the product owner, not by us. Nothing checks
  screens before they ship.
- **Type and density too small.** 13px base with fixed `text-[11px]` sizes
  everywhere. Being fixed now (14px base, token-based scale).
- **Screens grew feature by feature.** `ConnectionsWorkbench.tsx` (335 lines,
  33 `useState`) and `AnalystPage.tsx` (394 lines, 36 `useState`) mix layout,
  data and state. That is where inconsistencies and state bugs come from.
- **States are uneven.** Only 7 files use `EmptyState` and 10 use `Skeleton`;
  error, offline and permission states differ per screen.
- **Missing desktop conventions.** No native app menu (Edit → Copy/Paste, Window,
  Help), few native context menus, no shortcut reference.
- **Trust is not visible enough.** Read-only, production vs staging, and what the
  AI can see are explained in places but not shown consistently.

## 2. Design principles

1. **Native first.** Behave like a Mac/Windows app: menus, shortcuts, context
   menus, window state, no web patterns (no hover-underline links, no page scroll).
2. **Calm density.** Information-dense like a database client, but with clear
   hierarchy: one primary action per view, quiet chrome, data in focus.
3. **Safe by default, visibly.** Read-only, environment and AI access are always
   visible where the user acts on data.
4. **Every state designed.** Loading, empty, error, offline, no permission, partial
   data. No blank panes, no raw error strings.
5. **Keyboard complete.** Everything reachable without a mouse; shortcuts
   discoverable.

## 3. Information architecture

| Area | Purpose | Changes |
|---|---|---|
| **Connections** (home) | Browse, query, manage databases | Becomes the default screen. Connection switcher at the top of the explorer. Folders/groups and environment tags. |
| **Analyst** | AI analysis of data | Also available as a side panel inside the workbench, with the current table as context. |
| **Integrations** (was "AI Clients") | MCP clients and agent providers | Merge AI clients and analyst providers into one place: "where your data can go". |
| **Activity** | Audit of every query by AI clients, analyst and you | Becomes the audit log: filter, export, per-connection view. |
| **Settings** | App preferences | Sections: General, Appearance, Server, Data & privacy, About. |

Global: command palette as the primary navigation (⌘K), a status bar (server,
port, background mode, current connection, read-only badge), and a shortcut sheet (⌘/).

## 4. Workstreams

### A. Foundations (tokens and components)
- Type scale from one base size (in progress), 4px spacing grid, three elevation
  levels, icon sizes 14/16/20 only, motion 120–200ms with reduced-motion support.
- Data-viz palette per theme (categorical, sequential, diverging), checked for
  colour-blind safety.
- Environment colours as tokens: production (red), staging (amber), development
  (green), none (neutral). Used for badges, tab strips and window accents.
- **Component gallery** route (dev builds only) showing every component in every
  state, light/dark, at 12/14/18px. This is the reference for reviews and screenshots.

### B. Shell and platform conventions
- Native app menu: App (About, Settings, Quit), File (New connection, New query,
  Close tab), Edit (Undo, Copy, Paste, Select all, Find), View (sidebar, zoom,
  appearance), Window, Help (shortcuts, logs, report a problem).
- Native context menus on connections, tables, grid cells and tabs.
- Remember window size, pane sizes, open tabs and last connection across restarts.
- Shortcut sheet (⌘/), OS-correct shortcut labels everywhere.

### C. Workbench (the core product)
- **Explorer:** connection switcher, search across schemas/tables/columns, favourites,
  recent tables, lazy tree with counts.
- **Data grid:** column pinning and reorder, per-column filter, type-aware cells
  (null, boolean, date, JSON with expand, binary), row detail panel, copy as
  CSV/TSV/JSON/SQL IN-list, export result, column stats on header hover.
- **Query editor:** format SQL, run selection or statement under cursor, cancel
  running query, result tabs per statement, saved queries, query history with
  search, EXPLAIN view, read-only rejection explained inline with a fix.
- **Performance budgets:** first paint of a 50k-row result < 300ms; scrolling at
  60fps; no layout shift while loading pages.

### D. Connection management
- Folders and groups, environment tag with colour, description, favourite.
- Enterprise auth options: SSH tunnel, client certificates / CA bundle,
  AWS IAM for Redshift/RDS. (Scope decision needed.)
- Health at a glance: last test, latency, server version, last used by AI.
- Export/import connection list without secrets, for sharing setups.

### E. Trust, safety and privacy UX
- Read-only badge in the toolbar of every query surface, with a tooltip explaining
  the guarantee.
- Production connections: red environment strip on tabs and a confirmation the
  first time AI access is enabled.
- Per-connection AI access (MCP clients, analyst), visible in the explorer.
- "What the AI saw": each analyst turn and MCP call links to the exact queries
  and the rows returned (preview), from Activity.

### F. Analyst
- Side panel in the workbench, `@` mentions, playbooks, pinned results and reports.
- Clear provider identity per thread ("OpenCode · Claude Sonnet") and where data goes.
- Step list collapsed by default with a one-line summary; charts first-class.

### G. States, feedback and content
- One state catalogue (loading, empty, error, offline, permission, partial) used by
  every screen.
- Error standard: what happened, why, how to fix, with a "copy details" action.
  Never raw driver errors without a hint.
- Toasts only for background results; inline messages for anything the user must act on.
- Undo for destructive actions where possible (delete connection, remove AI client)
  instead of confirm dialogs.
- Content audit: one term per concept ("connection", not database/DB/datasource),
  sentence case, helper text rules from `Field.tsx`.

### H. Accessibility (WCAG 2.2 AA)
- Keyboard-only pass of every screen, visible focus everywhere.
- Screen reader pass with VoiceOver and NVDA (grid and tree roles announced correctly).
- 200% zoom and 18px base without clipping; High Contrast theme verified.
- Colour never the only signal (status dots get icons or text).

### I. UI code health (prevents regressions)
- Split the workbench and analyst into feature modules: explorer, tabs, grid,
  editor, composer, message list, each with its own state hook.
- Replace scattered `useState` with reducers or small state machines for flows
  with many states (connection test, query run, streaming turn).
- Shared hooks for keyboard shortcuts and context menus.

### J. Quality process
- **Visual regression:** screenshot tests of the component gallery and key screens
  (light/dark × 960/1440px × 14/18px) in CI using the dev preview with fixture data.
- **Design review checklist** on every UI change: states, keyboard, focus, sizes,
  dark mode, 960px, copy.
- **Usability test** with 5 target users per milestone: add a connection, find a
  table, run a query, connect an AI client, ask the analyst a question.

## 5. Milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M1 Polish baseline** | Fonts and sizing (in progress), component gallery, state catalogue applied to all screens, native app menu and context menus, workbench/analyst refactor | No layout bugs at 960–2560px and 12–18px; every screen passes the review checklist |
| **M2 Workbench pro** | Grid and editor features (C), explorer search/favourites, connection folders and environment tags, trust UX (E) | Usability test: 5/5 users run a query and find a table without help |
| **M3 Enterprise** | SSH/certs/IAM (if in scope), audit-log Activity with export, accessibility audit, visual regression in CI, analyst side panel | WCAG 2.2 AA pass; zero untested screens in CI |

## 6. How we'll measure it

- Time to first successful connection test (target < 2 minutes).
- Time from install to first AI client connected.
- Connection test success rate and top error codes.
- Query errors that include an actionable hint (target 100%).
- Crash-free sessions.
These need opt-in, local-first telemetry (decision below).

## 7. Decisions needed

1. **Enterprise connectivity scope:** SSH tunnels, client certificates, AWS IAM.
   High value for enterprise databases, significant work.
2. **Telemetry:** opt-in anonymous usage metrics to measure the above, or none.
3. **Brand:** keep the neutral look, or define a visual identity (logo, accent,
   illustration style) before the public release.
4. **"Integrations" rename** and merging AI clients with analyst providers.
