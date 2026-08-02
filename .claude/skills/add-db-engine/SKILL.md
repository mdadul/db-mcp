---
name: add-db-engine
description: Adds a new database engine to db-mcp by interviewing the user for engine details, then updating all required touchpoints (config, schemas, executor, MCP tools, icon registry). Use when the user says "add [database] support", "support [engine]", or "new database engine".
---

# Add Database Engine

## Purpose
Wire a new database engine end-to-end across all 10 touchpoints — from the frontend picker to the backend executor and MCP schema tools — without regressions.

## When To Use
- "add DuckDB / MongoDB / [any engine] support"
- "new database engine"
- "support [engine] connections"

## Step 1 — Interview

Ask questions one at a time, waiting for an answer before continuing. For each question, give your recommended answer. If the codebase can answer a question, explore it instead of asking.

---

Start here:

> **What database engine do you want to add?**

Then resolve each of the following in sequence. Skip any that can be inferred from prior answers or codebase exploration.

**Q1 — Type key**
Short lowercase identifier used in code (e.g. `postgresql`, `redshift`, `duckdb`). No spaces or special characters.
*Recommended: lowercase version of the engine name.*

**Q2 — Label**
Display name shown in the UI (e.g. `Amazon Redshift`, `DuckDB`).
*Recommended: official product name.*

**Q3 — Badge**
Short text in the picker badge — usually the default port, or `File` for file-based engines.
*Recommended: check the engine's official docs for default port.*

**Q4 — Hint**
One-line description of typical use cases shown in the picker.
*Recommended: 2–3 well-known hosting providers or deployment contexts.*

**Q5 — Default port**
Use `0` for file-based engines with no network port.
*Recommended: official default port from the engine's docs.*

**Q6 — requiresNetwork**
Does the engine need host / port / username / password?
*Recommended: `false` only for file-based engines like SQLite. `true` for everything else.*

**Q7 — sslRequired**
Must SSL always be enabled, regardless of the user's toggle?
*Recommended: `true` for cloud-managed warehouses (Redshift, Snowflake, BigQuery). `false` for local-first engines.*

**Q8 — Driver**
Which npm package handles the connection? Check whether the engine speaks an existing wire protocol before asking.
- `postgres` — any PostgreSQL-wire-compatible engine (Redshift, CockroachDB, TimescaleDB, etc.)
- `mysql2/promise` — any MySQL-wire-compatible engine (MariaDB, PlanetScale, etc.)
- `better-sqlite3` — file-based SQLite-compatible engines
- New package — if needed, confirm it's in `package.json` or needs installing.

*Recommended: check wire protocol compatibility first. Most cloud databases re-use an existing driver.*

**Q9 — Schema listing query**
SQL to list all tables in the database.
*Recommended: check if `information_schema.tables` works for this engine. If not, ask for the engine-specific catalog query.*

**Q10 — Table schema query**
SQL to get column definitions for a given table.
*Recommended: `information_schema.columns` if available. Otherwise ask for the engine-specific approach (e.g. `PRAGMA table_info` for SQLite).*

**Q11 — Icon**
Explore `client/public/` first. If an icon file already exists, use it.
If not: ask the user for a filename and have them place it in `client/public/`.

---

Do not write any code until all answers are confirmed.

## Step 2 — Implement (10 touchpoints in order)

### T1 · `client/src/features/databases/types/index.ts`
- Add type key to `DbEngineType` union.
- Add `sslRequired: boolean` to `DbEngineConfig` if not already present.
- Add entry to `DB_ENGINES[]` with all fields from the interview.

### T2 · `client/src/features/databases/schemas/databaseSchemas.ts`
- Add type key to `z.enum([...])` in `baseDatabaseFormObject`.
- If `requiresNetwork = false`: update `superRefine` to skip host/username validation for this type (same pattern as `sqlite`).

### T3 · `src/api/routes/databases/types.ts`
- Add `z.object({ type: z.literal("<key>"), ... })` to the `CreateDatabaseSchema` discriminated union.
  - File-based: host/port/username/password optional with empty defaults.
  - Network: require host/port/username/password.
- Add type key to `UpdateDatabaseSchema` enum.

### T4 · `src/services/dbExecutor.ts`
- Add type key to `DbConfig.type` and `DbExecutor.type` unions.
- Add `case "<key>":` in `createExecutor` switch.
  - Re-using an existing driver → fall through to that case (e.g. `case "redshift": case "postgresql": default:`).
  - New driver → add a block and import at the top.
  - `sslRequired = true` → hard-code `ssl: "require"` regardless of `config.ssl`.

### T5 · `src/mcp/tools/getDatabaseSchema.ts`
- Add `case "<key>":` with the schema listing query from Q9.
- Normalise result to `{ table_name, table_type }`.

### T6 · `src/mcp/tools/getTableSchema.ts`
- Add `case "<key>":` with the table schema query from Q10.
- Map to `columns`, `indexes`, and `foreignKeys`.

### T7 · `client/src/features/databases/hooks/useDatabaseForm.ts`
- Add type key to `handleEngineChange` function signature union.
- Update `db.type as "..."` cast in the `useEffect` load.
- SSL: `ssl: engine.sslRequired ? true : (engine.requiresNetwork ? prev.ssl : false)`.

### T8 · `client/src/components/brand/DbEngineIcon.tsx`
```ts
<key>: { src: "/<filename>", label: "<Label>" },
```

### T9 · `client/src/features/databases/components/DatabaseForm.tsx`
SSL toggle is already locked via `currentEngine.sslRequired`. No change needed unless the engine requires special form behaviour.

### T10 · `client/public/<filename>`
Confirm the icon file is present and valid: `file client/public/<filename>`.

## Step 3 — Verify

```bash
cd client && bunx tsc --noEmit
file client/public/<filename>
grep "<key>" client/src/components/brand/DbEngineIcon.tsx
```

Browser checks:
1. `/new` — engine appears in the SELECT with its icon.
2. Select it — SSL toggle locked/unlocked correctly per `sslRequired`.
3. `requiresNetwork = false` — host/db and credentials sections hidden.

## Output Format

```
✓ T1  types/index.ts — added "<key>" to DbEngineType + DB_ENGINES
✓ T2  databaseSchemas.ts — added "<key>" to enum
✓ T3  types.ts (API) — added discriminated union variant
✓ T4  dbExecutor.ts — case "<key>" using <driver>
✓ T5  getDatabaseSchema.ts — case "<key>"
✓ T6  getTableSchema.ts — case "<key>"
✓ T7  useDatabaseForm.ts — type union + ssl handling
✓ T8  brand/DbEngineIcon.tsx — "<key>": { src: "/<filename>" }
✓ T9  DatabaseForm.tsx — no change / <change>
✓ T10 client/public/<filename> — icon verified

tsc clean. Icon valid. Picker renders correctly.
```