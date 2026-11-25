# DB MCP

**Local, read-only database access for AI clients over Model Context Protocol (MCP).**

[![CI](https://github.com/mdadul/db-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/mdadul/db-mcp/actions/workflows/ci.yml) [![Latest release](https://img.shields.io/github/v/release/mdadul/db-mcp)](https://github.com/mdadul/db-mcp/releases/latest)

DB MCP is a desktop application for macOS, Windows, and Linux. It stores connection details on your computer, runs the MCP server on loopback, and gives compatible AI clients a small set of schema and query tools.

[Download the latest release](https://github.com/mdadul/db-mcp/releases/latest) · [Report a bug](https://github.com/mdadul/db-mcp/issues/new) · [Read the security notes](#security)

## What it does

- Connects to PostgreSQL, MySQL, SQLite, Amazon Redshift, and MongoDB.
- Lets AI clients list enabled databases, inspect schemas, and run read-only queries.
- Rejects write queries and adds a row limit when a query does not include one.
- Encrypts saved database credentials with AES-256-GCM. The encryption key is stored in the OS keychain when available.
- Runs on `127.0.0.1`; it does not expose a hosted service or require a DB MCP account.
- Checks for signed app updates. Review release notes and install updates from **Settings → About**.

DB MCP's query guard is an extra control. Use database accounts that have read-only permissions. The database enforces those permissions.

## Install

Download an installer from [GitHub Releases](https://github.com/mdadul/db-mcp/releases/latest).

| Platform | Downloads |
|---|---|
| macOS, Apple silicon | `.dmg` for aarch64 |
| macOS, Intel | `.dmg` for x64 |
| Windows | `.msi` or `.exe` |
| Linux | `.AppImage`, `.deb`, or `.rpm` |

The current builds are not signed with a publisher identity or notarized. Your OS may show a first-launch warning.

- **macOS:** If Gatekeeper blocks the app, open **System Settings → Privacy & Security** and choose **Open Anyway**. You can also remove the quarantine flag from an app you trust:
  ```bash
  xattr -dr com.apple.quarantine "/Applications/DB MCP.app"
  ```
- **Windows:** If SmartScreen warns, select **More info → Run anyway**.
- **Linux:** For an AppImage, mark the downloaded file executable before opening it.

## Get started

1. Open DB MCP and choose **Connections → New connection**.
2. Enter the database details, then select **Test Connection**.
3. Use a database account with read-only grants.
4. Open **AI Clients** to install a supported client configuration or copy its MCP snippet.

The MCP endpoint defaults to `http://127.0.0.1:4080/mcp`. You can change the port in **Settings**.

## Connect an MCP client

DB MCP can write configuration for Claude Desktop, Cursor, VS Code, Windsurf, and LM Studio. The **AI Clients** page shows the configuration format for each client and provides snippets for other MCP clients.

### Claude Code

```bash
claude mcp add --transport http db-mcp http://127.0.0.1:4080/mcp
```

### Generic HTTP configuration

```json
{
  "mcpServers": {
    "db-mcp": {
      "url": "http://127.0.0.1:4080/mcp"
    }
  }
}
```

Some Claude Desktop versions need the `mcp-remote` bridge instead of a direct HTTP URL. Use the snippet shown in DB MCP for that client. Restart the AI client after changing its configuration.

## Database support

| Database | Notes |
|---|---|
| PostgreSQL | PostgreSQL-compatible services, including Supabase, Neon, RDS, and CockroachDB |
| MySQL | MySQL and MariaDB, including PlanetScale and RDS |
| SQLite | Local database files; use the file picker or enter a path |
| Amazon Redshift | SSL is required |
| MongoDB | Atlas, self-hosted MongoDB, and DocumentDB |

## MCP tools

| Tool | Purpose |
|---|---|
| `list_databases` | Lists enabled connections and their `database_id` values |
| `get_database_schema` | Lists tables in a database, with an optional name filter |
| `get_table_schema` | Returns columns, indexes, and foreign keys for a table |
| `execute_read_query` | Runs a read-only query and returns up to 100 rows by default, with a maximum of 1,000 |

The query tool accepts SQL `SELECT`, `EXPLAIN`, `DESCRIBE`, and `SHOW` statements. It adds `LIMIT 100` when a SQL query has no limit. MongoDB queries use DB MCP's JSON query format rather than shell or JavaScript syntax.

## Security

- **Local-only listener:** the MCP server binds to `127.0.0.1`. Host checks reject unexpected hosts, and browser-origin requests to `/mcp` are rejected.
- **Credential storage:** saved credentials are encrypted with AES-256-GCM. The encryption key is kept in the OS keychain when available. If the keychain is unavailable, DB MCP stores a local key file with mode `0600` on Unix systems.
- **Read-only guard:** write operations are rejected before reaching the database. A read-only database account remains the primary database-side control.
- **Local API session:** the app's internal API uses a per-launch session token.
- **User-account boundary:** other processes running as your OS user can connect to the loopback MCP endpoint. DB MCP does not add authentication to that endpoint.

For vulnerability reports, use [GitHub's private vulnerability reporting](https://github.com/mdadul/db-mcp/security/advisories/new) when available, or contact the maintainers through the repository.

## Background operation and updates

Closing the window hides DB MCP in the menu bar or system tray. Use the tray menu to reopen the app, restart the server, view logs, or quit. Settings can start DB MCP when you sign in, or keep only its MCP server running in the background.

DB MCP checks for signed app updates on launch. To review notes or install an available update, open **Settings → About** and select **Download and restart**. The first update from v0.1.1 requires a manual installation of v0.1.2 because v0.1.1 did not include the updater.

## Local data

Application files are stored under the OS application-support directories for `dev.dbmcp.desktop`.

| OS | Data | Logs |
|---|---|---|
| macOS | `~/Library/Application Support/dev.dbmcp.desktop/` | `~/Library/Logs/dev.dbmcp.desktop/` |
| Windows | `%APPDATA%\dev.dbmcp.desktop\` | `%LOCALAPPDATA%\dev.dbmcp.desktop\logs\` |
| Linux | `~/.local/share/dev.dbmcp.desktop/` | `~/.local/share/dev.dbmcp.desktop/logs/` |

The app data directory contains the internal SQLite database. Settings are stored in the OS application config directory. On Linux, settings live at `~/.config/dev.dbmcp.desktop/settings.json`. If OS keychain storage is unavailable, the data directory may also contain `encryption.key`, created with mode `0600` on Unix systems. Logs are rotated. Use **Settings → Reset data** to remove saved connections, credentials, and local history.

## Development

### Requirements

- Node.js 26 (see `.nvmrc`)
- [Bun](https://bun.sh)
- Stable Rust
- [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/) for your OS

### Build and test

```bash
bun install
bun run dev
bun run type-check
bun run test
bun run format:check
cd desktop/src-tauri && cargo test
bun run desktop:build
```

`bun run dev` starts the Tauri desktop app with the backend sidecar. Do not start `src/index.ts` directly; the supported launcher supplies the session token and secrets.

### Project layout

```text
desktop/src-tauri/   Tauri shell, updater, sidecar supervisor, keychain, tray, IPC
src/                 Local backend and MCP server
client/              React desktop interface
scripts/             Sidecar bundling and Node runtime setup
docs/                Architecture, release notes, and project plans
```

For database schema changes, edit `src/db/schema.ts`, run `bun run db:generate`, and commit the generated migration. Migrations run when the app starts.

## Contributing

Bug reports and focused pull requests are welcome. For changes that affect database access, credential handling, or updater behavior, include the user problem and how you tested the change. Run the relevant checks above before opening a PR.

## License

This repository does not currently include a license file. Until one is added, the source is not licensed for reuse, modification, or redistribution.
