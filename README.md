# DB MCP Gateway

Give Claude Code, Cursor, Windsurf, or any MCP-compatible AI tool **read-only access to your databases** — without exposing credentials or risking data changes.

Self-hosted. Everything runs locally. Your passwords never leave your machine.

### Supported databases

| | Database | Notes |
|---|---|---|
| <img src="client/public/postgre.png" width="20" height="20"> | **PostgreSQL** | All versions |
| <img src="client/public/mysql.png" width="20" height="20"> | **MySQL** | MySQL 5.7+ / MariaDB |
| <img src="client/public/sqlite.webp" width="20" height="20"> | **SQLite** | Local file, no server needed |
| <img src="client/public/redshift.png" width="20" height="20"> | **Amazon Redshift** | SSL required, Redshift-specific catalog queries |

---

## What it does

Instead of copy-pasting query results between your DB client and your AI tool, the gateway lets your AI query the database directly. It can explore schemas, inspect tables, and run SELECT queries. It **cannot** insert, update, delete, or drop anything.

---

## Quick Start

### 1. Install and run

```bash
# Prerequisites: Bun (https://bun.sh)
git clone https://github.com/mdadul/db-mcp
cd db-mcp

bun install
bun run dev
```

Open **http://localhost:4080** — the web UI is ready.

### 2. Add a database

Click **Add Your First Database** and fill in:
- Host, port, database name
- A read-only database user and password (recommended — the gateway enforces read-only at the query level regardless, but defense in depth is good)

Hit **Test Connection** to confirm it works.

### 3. Get your MCP token

The gateway generates a token in `.env` on first run:

```bash
grep MCP_TOKEN .env
```

### 4. Connect your AI tool

#### Claude Code (CLI)

```bash
claude mcp add --transport http db-mcp http://localhost:4080/mcp \
  --header "Authorization: Bearer <MCP_TOKEN>"
```

Then restart Claude Code.

#### Cursor / Windsurf / Claude Desktop

Add to your `mcp.json`:

```json
{
  "mcpServers": {
    "db-mcp": {
      "url": "http://localhost:4080/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_TOKEN>"
      }
    }
  }
}
```

#### Claude.ai Web

Claude.ai requires HTTPS. Expose the gateway through a tunnel first:

```bash
# Option A — Cloudflare (no account needed)
npx cloudflared tunnel --url http://localhost:4080

# Option B — ngrok
ngrok http 4080
```

Copy the `https://...` URL from the tunnel output, then add it in Claude.ai → Settings → Integrations → Add MCP Server.

---

## Using it with your AI

Once connected, just ask naturally:

> "How many orders were created this week?"
> "What columns does the `users` table have?"
> "Show me the last 10 failed jobs."

The AI will call the gateway tools automatically — no copy-pasting.

### Available tools

| Tool | What it does |
|------|-------------|
| `list_databases` | Lists all connected databases |
| `get_database_schema` | Lists tables (optional name filter) |
| `get_table_schema` | Shows columns, indexes, and foreign keys for a table |
| `execute_read_query` | Runs a SELECT query (capped at 100 rows by default, max 1000) |

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_PATH` | Yes | Path for the local SQLite metadata store (e.g. `./data/db-mcp.sqlite`) |
| `ENCRYPTION_KEY` | Yes | 64-char hex key for credential encryption. Generate: `openssl rand -hex 32` |
| `MCP_TOKEN` | Yes | Bearer token for the `/mcp` endpoint. Generate: `openssl rand -base64 32` |
| `PORT` | No | HTTP port (default: `4080`) |

A `.env` file is created with generated values on first run.

---

## Troubleshooting

**Tools not showing up in Claude Code**
Restart Claude Code after adding the MCP server. If still missing, run `claude mcp list` to confirm it's registered and shows `✓ Connected`.

**"Failed to connect" in Claude Code**
Check the gateway is running (`http://localhost:4080` should load) and the token in your config matches `.env`.

**"Session not found" errors**
The gateway is stateless — each request is independent. If you see this, reconnect the MCP server in your IDE.

**"URL must start with https"** (Claude.ai Web)
Claude.ai blocks plain HTTP. Use a tunnel — see the Claude.ai Web setup above.

**Connection refused to my database**
If the gateway runs in Docker and your database is on the host, use `host.docker.internal` instead of `localhost` as the host.

---

## Security notes

- The `MCP_TOKEN` controls access to all your databases via the gateway. Treat it like a password.
- Database credentials are encrypted with AES-256-GCM. The key lives only in `ENCRYPTION_KEY` — never in the database.
- Only `SELECT`, `SHOW`, `DESCRIBE`, and `EXPLAIN` are permitted. Write operations are rejected at the gateway layer before reaching the database.
- All queries are logged in the web dashboard under each database's Logs tab.


