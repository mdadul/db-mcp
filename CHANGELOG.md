# Changelog

All notable changes to this project are documented here. Versions follow [semver](https://semver.org/); see [CONTRIBUTING.md](CONTRIBUTING.md#semver-for-this-project) for what counts as breaking for MCP tools.

## Unreleased

_Nothing yet._

## 1.1.0 - 2026-10-15

### Added
- `db-mcp stdio` transport for MCP clients that launch servers as a subprocess (no HTTP server or token needed).
- `db-mcp --version`.
- `HOST` environment variable. The gateway binds to `127.0.0.1` by default; Docker sets `HOST=0.0.0.0`.
- MCP tool annotations (`readOnlyHint`, `idempotentHint`, etc.) on all four tools.

### Changed
- The generated `MCP_TOKEN` is no longer printed to the terminal. It is stored in `~/.db-mcp/.env` (or `DB_MCP_HOME`).
- Tool errors are returned as `{ error, hint }` with `isError: true`, and call logs record the real outcome.
- `execute_read_query` and the other tool descriptions list MongoDB and the SQL engines.
- Minimum Node.js version lowered from 24 to 22.
- The server reports its version from `package.json` instead of a hardcoded `1.0.0`.

### Removed
- Internal `src/mcp/tools/executeReadQuery.ts` pass-through wrapper (no public change).

## 1.0.2

Earlier release. See git history for details.
