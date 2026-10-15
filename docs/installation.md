# Connecting AI clients to db-mcp

db-mcp runs as a local HTTP gateway at `http://localhost:4080/mcp` and every request needs a bearer token.

## 1. Start the gateway

```bash
npx @mdadul/db-mcp          # or: npm install -g @mdadul/db-mcp && db-mcp
```

Docker users: `sh scripts/setup.sh && docker compose up`.

Add your databases in the web UI at `http://localhost:4080`.

## 2. Get your token

```bash
grep MCP_TOKEN ~/.db-mcp/.env      # npm install (override dir with DB_MCP_HOME)
grep MCP_TOKEN .env                # Docker / repo checkout
```

In the snippets below, replace `<MCP_TOKEN>` with that value. Keep it out of git.

## 3. Connect a client

### Automatic

```bash
db-mcp install                # pick from a list
db-mcp install <client-id>    # claude-code | claude-desktop | cursor | windsurf | opencode | vscode
```

The installer merges one `db-mcp` entry into the client's config and leaves your other servers alone. Restart the client afterwards.

### Manual

| Client | Config location | Notes |
|---|---|---|
| Claude Code | `claude mcp add` | CLI command |
| Cursor | `~/.cursor/mcp.json` | |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | uses `serverUrl` |
| VS Code | `.vscode/mcp.json` (per project) | uses `servers` + `type` |
| opencode | `~/.config/opencode/opencode.json` | `type: "remote"` |
| Claude Desktop | see below | remote servers need a bridge |
| Claude.ai web | Settings → Integrations | needs HTTPS tunnel |

**Claude Code**

```bash
claude mcp add --transport http db-mcp http://localhost:4080/mcp \
  --header "Authorization: Bearer <MCP_TOKEN>"
```

Add `--scope user` to make it available in every project.

**Cursor** (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "db-mcp": {
      "url": "http://localhost:4080/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`)

```json
{
  "mcpServers": {
    "db-mcp": {
      "serverUrl": "http://localhost:4080/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`)

```json
{
  "servers": {
    "db-mcp": {
      "type": "http",
      "url": "http://localhost:4080/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

Don't commit this file with a real token. VS Code also supports `inputs` prompts for secrets.

**opencode** (`~/.config/opencode/opencode.json`)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "db-mcp": {
      "type": "remote",
      "url": "http://localhost:4080/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

**Claude Desktop**

`claude_desktop_config.json` is documented for local (stdio) servers, so a plain `url` entry may be ignored. Two options that work today:

1. Bridge through `mcp-remote` in `claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "db-mcp": {
         "command": "npx",
         "args": [
           "-y", "mcp-remote", "http://localhost:4080/mcp",
           "--header", "Authorization:${AUTH_HEADER}"
         ],
         "env": { "AUTH_HEADER": "Bearer <MCP_TOKEN>" }
       }
     }
   }
   ```

2. Add it as a custom connector in Settings → Connectors (needs an HTTPS URL, see the tunnel steps below).

Config path: macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`, Linux `~/.config/Claude/claude_desktop_config.json`.

**Claude.ai web** (HTTPS required)

```bash
npx cloudflared tunnel --url http://localhost:4080    # or: ngrok http 4080
```

Add the `https://…/mcp` URL under Settings → Integrations. A tunnel exposes the gateway to the internet: the bearer token is your only protection, so stop the tunnel when you're done.

### Other clients (not covered by `db-mcp install`)

These follow each client's own format. Check the client's MCP docs if a snippet stops working.

**Gemini CLI** (`~/.gemini/settings.json`)

```json
{ "mcpServers": { "db-mcp": {
  "httpUrl": "http://localhost:4080/mcp",
  "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
} } }
```

**Codex CLI** (`~/.codex/config.toml`), reads the token from an env var:

```toml
[mcp_servers.db-mcp]
url = "http://localhost:4080/mcp"
bearer_token_env_var = "DB_MCP_TOKEN"
```

```bash
export DB_MCP_TOKEN=<MCP_TOKEN>
```

**Cline** (`cline_mcp_settings.json`)

```json
{ "mcpServers": { "db-mcp": {
  "type": "streamableHttp",
  "url": "http://localhost:4080/mcp",
  "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
} } }
```

## 4. Verify

Ask the client: "List my databases using db-mcp." You should get the databases you added in the web UI.

Check the gateway directly:

```bash
curl -s -X POST http://localhost:4080/mcp \
  -H "Authorization: Bearer <MCP_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `401 Unauthorized` | Token mismatch. Re-read it from `.env` and update the client config. |
| Connection refused | Gateway isn't running, or `PORT` differs from 4080. |
| Server shows but no tools | Restart the client fully, not just the chat window. |
| Tools return "not found" | `list_databases` is empty. Add a database in the web UI and make sure it's enabled. |
| Docker, client on host | Use `http://localhost:4080/mcp`. From another container use the service name. |
| Token changed after reinstall | Run `db-mcp install <client>` again to rewrite the config. |
