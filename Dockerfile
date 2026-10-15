# ── Stage 1: Build the React client ──────────────────────────────────────────
FROM oven/bun:1-alpine AS client-builder
# Root deps: src/ (imported by the client via @server) needs zod, drizzle, etc.
# Not frozen: the root bun.lock still lists the removed client workspace.
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --ignore-scripts
# Client deps come from the client's own lockfile.
WORKDIR /app/client
COPY client/package.json client/bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
# vite.config.ts aliases @server to ../src, so src/ must sit next to client/.
WORKDIR /app
COPY client/ ./client/
COPY src/ ./src/
WORKDIR /app/client
RUN bunx vite build

# ── Stage 2: Install server production deps (compiles better-sqlite3) ─────────
# Same base as runtime so the compiled .node addon's GLIBC matches.
FROM node:24-slim AS server-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json bun.lock* ./
COPY client/package.json ./client/package.json
RUN npm install --omit=dev --ignore-scripts=false

# ── Stage 3: Runtime (lean — no build tools needed) ───────────────────────────
# Node 24 is used here because better-sqlite3 uses Node native addons (napi)
# which are not supported by Bun's runtime on Linux.
FROM node:24-slim AS runtime
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
# src/version.ts reads package.json at startup.
COPY package.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY --from=client-builder /app/client/dist ./client/dist

# Persistent data lives in a volume — never baked into the image.
RUN mkdir -p /data
VOLUME /data

ENV DATABASE_PATH=/data/db-mcp.sqlite
ENV PORT=4080
ENV HOST=0.0.0.0
EXPOSE 4080

# Run setup (generates .env if missing) then start the server.
CMD ["sh", "-c", "sh scripts/setup.sh && node --env-file=.env src/index.ts"]
