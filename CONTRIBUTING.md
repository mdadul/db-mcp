# Contributing to DB MCP Gateway

This covers running the project from source, testing, database migrations,
and cutting a release. For end-user install/usage instructions, see the
[README](README.md). For codebase architecture, see [CLAUDE.md](CLAUDE.md).

## Prerequisites

- [Bun](https://bun.sh) (client build + dev workflow)
- Node.js 24 or newer (server runtime, `engines` in [package.json](package.json))

## Local development

```bash
git clone https://github.com/mdadul/db-mcp
cd db-mcp
bun install
bun run dev   # generates .env in the repo root, then starts the server with --watch
```

Open **http://localhost:4080**. Your `MCP_TOKEN` is in the generated `.env`.

`bun run dev` runs `scripts/setup.sh` (generates `.env` with random keys if one
doesn't exist) then `node --env-file=.env --watch src/index.ts`. This is a
separate code path from the published CLI (`src/cli.ts`), which stores its
config in `~/.db-mcp/` instead of the repo root — see [CLAUDE.md](CLAUDE.md)
for details.

### Client dev server

```bash
bun run dev:client   # cd client && bun run dev
```

Runs the React dashboard with an API proxy to the server.

## Environment variables

`scripts/setup.sh` generates these automatically. Set them by hand only if
you need custom values.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_PATH` | Yes | Path for the local SQLite metadata store (e.g. `./data/db-mcp.sqlite`) |
| `ENCRYPTION_KEY` | Yes | 64-char hex key for credential encryption. Generate: `openssl rand -hex 32` |
| `MCP_TOKEN` | Yes | Bearer token for the `/mcp` endpoint. Generate: `openssl rand -base64 32` |
| `PORT` | No | HTTP port (default: `4080`) |

## Testing

```bash
npm test               # node --test src/**/*.test.ts, no DB required
npm run type-check     # tsc --noEmit
```

## Database migrations

The internal control-plane DB (SQLite, via Drizzle) is defined in
[src/db/schema.ts](src/db/schema.ts).

```bash
# after editing schema.ts
npm run db:generate    # writes a new SQL file to src/db/migrations/
npm run db:migrate     # applies pending migrations
npm run db:studio      # Drizzle Studio GUI
```

Commit the generated migration file alongside your schema change. Migrations
also run automatically on server startup ([src/db/runMigrations.ts](src/db/runMigrations.ts)).

## Building

```bash
npm run build:server   # tsc -p tsconfig.build.json, copies migrations into dist/
npm run build:client   # builds the React dashboard into client/dist/
npm run build          # full package build (scripts/build-package.sh) — server + client
```

## Publishing a release

Releases go out from a `v*` tag through [.github/workflows/npm-publish.yml](.github/workflows/npm-publish.yml). Don't run `npm publish` by hand.

Work through the [release checklist](docs/release-checklist.md) before tagging.

1. Move the `Unreleased` entries in [CHANGELOG.md](CHANGELOG.md) under a new version heading with today's date.
2. Bump the version without creating a git tag yet:
   ```bash
   npm version patch --no-git-tag-version   # or minor / major
   ```
3. Commit the version bump and changelog, then tag the commit. The tag must match `package.json`, or the workflow fails.
   ```bash
   git commit -am "chore: release vX.Y.Z"
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```

The workflow runs type-check, tests, build and a smoke test of the packed tarball, then publishes that same tarball with provenance.

### Semver for this project

The MCP tool names, parameters and response fields are the public API, so:

- **Major:** removing or renaming a tool or parameter, or changing or removing a response field.
- **Minor:** adding a tool, an optional parameter, or a response field, or adding a database type.
- **Patch:** fixes that don't change tool names, parameters or response shape.

## Docker image

The [Dockerfile](Dockerfile) is a multi-stage build: Bun builds the client,
npm installs server deps and compiles native modules, and the runtime image
is `node:24-slim`. It bypasses `cli.ts` entirely — its `CMD` runs
`scripts/setup.sh` then `node --env-file=.env src/index.ts` directly. Pushed
to Docker Hub via [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml)
on pushes to `main` and on releases.
