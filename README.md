# DB MCP

A desktop app that stores your database connections encrypted on your computer and exposes them, read-only, to AI coding tools over MCP. The MCP endpoint listens on `127.0.0.1` only, so nothing leaves your machine.

Supported platforms: macOS (Apple silicon and Intel), Windows, Linux.

## Install

Download the latest build from [GitHub Releases](../../releases):

| Platform | File |
|---|---|
| macOS, Apple silicon | `.dmg` (aarch64) |
| macOS, Intel | `.dmg` (x64) |
| Windows | `.msi` or `.exe` |
| Linux | `.AppImage`, `.deb`, or `.rpm` |

Builds are not code-signed yet, so the OS will warn on first launch.

- **macOS:** Control-click the app and choose **Open**, then confirm. If macOS still refuses, remove the quarantine flag:
  ```bash
  xattr -dr com.apple.quarantine "/Applications/DB MCP.app"
  ```
- **Windows:** SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.

## Quick start

1. Open DB MCP and add a database (**Connections → New connection**). Engines: PostgreSQL, MySQL, SQLite, Amazon Redshift, MongoDB.
2. Click **Test Connection** to check the connection.
3. Use a database user that has only read permissions. DB MCP blocks write statements, but a read-only user is the real safeguard.
4. Open **AI Clients** and connect the tool you use (see below).

## Connect an AI client

On the **AI Clients** page, DB MCP can write the config entry for Claude Desktop, Cursor, VS Code, Windsurf, and LM Studio. For other clients, copy the snippet shown on that page.

**Claude Code:**

```bash
claude mcp add --transport http db-mcp http://127.0.0.1:4080/mcp
```

**Generic JSON config:**

```json
{
  "mcpServers": {
    "db-mcp": {
      "url": "http://127.0.0.1:4080/mcp"
    }
  }
}
```

Claude Desktop does not connect to a URL directly in all versions. Its snippet on the AI Clients page uses `npx -y mcp-remote http://127.0.0.1:4080/mcp`, which needs Node.js on your PATH.

Restart the AI client after changing its config. The port is `4080` by default and can be changed in **Settings**.

## Supported databases

| Engine | Notes |
|---|---|
| PostgreSQL | Supabase, Neon, AWS RDS, CockroachDB, and other PostgreSQL-compatible hosts |
| MySQL | MySQL and MariaDB, including PlanetScale and AWS RDS |
| SQLite | Local file |
| Amazon Redshift | SSL is required |
| MongoDB | MongoDB Atlas, self-hosted, and DocumentDB |

## MCP tools

| Tool | Description |
|---|---|
| `list_databases` | List enabled databases and their `database_id` values |
| `get_database_schema` | List tables, with an optional name filter |
| `get_table_schema` | Columns, indexes, and foreign keys for one table |
| `execute_read_query` | Run a read-only query (`SELECT`, `EXPLAIN`, `DESCRIBE`, `SHOW`); returns up to 100 rows by default, 1000 at most |

## Security model

- Database credentials are encrypted with AES-256-GCM. The encryption key is stored in the OS keychain. If the keychain is unavailable, it falls back to a `0600` file in the app data directory.
- The server binds to `127.0.0.1` and checks the `Host` header, which blocks DNS rebinding.
- Requests to `/mcp` that carry a browser `Origin` header are rejected. MCP clients do not send one.
- The internal `/api` used by the app requires a per-launch session token.
- Write statements are rejected before they reach the database. Use a read-only database user as well.
- Any program running as your OS user can call the MCP endpoint. DB MCP does not add authentication to `/mcp`, so treat your user account as the trust boundary.

## Running in the background

Closing the window hides DB MCP to the system tray. Use the tray menu to open the window, restart the server, open logs, or quit. Quitting stops the server. You can start DB MCP at login from **Settings**.

## Data locations

Paths below are typical. The exact location depends on the OS and the app identifier `dev.dbmcp.desktop`.

| OS | App data (database, fallback key) | Logs |
|---|---|---|
| macOS | `~/Library/Application Support/dev.dbmcp.desktop/` | `~/Library/Logs/dev.dbmcp.desktop/` |
| Windows | `%APPDATA%\dev.dbmcp.desktop\` | `%LOCALAPPDATA%\dev.dbmcp.desktop\logs\` |
| Linux | `~/.local/share/dev.dbmcp.desktop/` | `~/.local/share/dev.dbmcp.desktop/logs/` |

Files:

- `db-mcp.sqlite`: connection metadata and query logs (credentials are encrypted)
- `encryption.key`: only if the OS keychain is unavailable (`0600` permissions)
- `settings.json`: app settings. On macOS and Windows it is in the app data directory. On Linux it is in `~/.config/dev.dbmcp.desktop/`.
- `server.log`: sidecar log, rotated at 5 MB, keeping 3 files

To delete all saved connections and the encryption key, use **Settings → Reset data**. Type `reset` to confirm.

## Development

Prerequisites:

- Node.js 26 (see `.nvmrc`)
- [Bun](https://bun.sh)
- Rust (stable)
- Tauri system dependencies for your OS: https://v2.tauri.app/start/prerequisites/

```bash
bun install
bun run dev                  # build the sidecar, then run the app with hot reload
bun run test                 # unit tests
bun run type-check
cd desktop/src-tauri && cargo test
bun run desktop:build        # production bundle
```

Project layout:

```
desktop/src-tauri/   Tauri 2 shell (Rust): sidecar supervisor, keychain, tray, IPC, AI client config
src/                 Backend (Hono + MCP), runs only as the Tauri sidecar
client/              React UI, bundled into the app
scripts/             build-sidecar.mjs bundles src/ and a Node 26 binary for the target
docs/desktop-plan.md Architecture and contracts
```

Database schema changes: edit `src/db/schema.ts`, run `bun run db:generate`, and commit the generated migration. Migrations run on server start.
