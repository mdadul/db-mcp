#!/bin/sh
set -e

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

# Install client deps so a clean clone can build.
# Client deps are separate from the published package (no npm workspaces: they break installs of the tarball).
[ -x "$ROOT_DIR/client/node_modules/.bin/vite" ] || (cd "$ROOT_DIR/client" && npm install --no-audit --no-fund)

"$ROOT_DIR/node_modules/.bin/tsc" -p "$ROOT_DIR/tsconfig.build.json"
rm -rf "$ROOT_DIR/dist/db/migrations"
cp -R "$ROOT_DIR/src/db/migrations" "$ROOT_DIR/dist/db/migrations"

"$ROOT_DIR/client/node_modules/.bin/tsc" -b "$ROOT_DIR/client/tsconfig.json"
"$ROOT_DIR/client/node_modules/.bin/vite" build "$ROOT_DIR/client" --config "$ROOT_DIR/client/vite.config.ts"