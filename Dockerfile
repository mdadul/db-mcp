# ── Stage 1: Build the React client ──────────────────────────────────────────
FROM oven/bun:1-alpine AS client-builder
WORKDIR /app/client
COPY client/package.json client/bun.lock ./
RUN bun install
COPY client/ ./
# Skip tsc — @server path aliases don't resolve without the server source tree
RUN bunx vite build

# ── Stage 2: Install server production deps (compiles better-sqlite3) ─────────
# Isolating apt+bun here keeps the runtime stage lean and these layers cached.
FROM oven/bun:1 AS server-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json bun.lock* ./
# Real client/package.json so the workspace resolves without a stub mismatch
COPY client/package.json ./client/package.json
RUN bun install --production

# ── Stage 3: Runtime (lean — no build tools needed) ───────────────────────────
# Node 24 is used here because better-sqlite3 uses Node native addons (napi)
# which are not supported by Bun's runtime on Linux.
FROM node:24-slim AS runtime
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY --from=client-builder /app/client/dist ./client/dist

# Persistent data lives in a volume — never baked into the image.
RUN mkdir -p /data
VOLUME /data

ENV DATABASE_PATH=/data/db-mcp.sqlite
ENV PORT=4080
EXPOSE 4080

# Run setup (generates .env if missing) then start the server.
CMD ["sh", "-c", "sh scripts/setup.sh && node --env-file=.env src/index.ts"]
