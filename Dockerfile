# ── Stage 1: Build the React client ──────────────────────────────────────────
FROM oven/bun:1-alpine AS client-builder
WORKDIR /app/client
COPY client/package.json client/bun.lock ./
RUN bun install --frozen-lockfile
COPY client/ ./
RUN bun run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# better-sqlite3 needs build tools for its native addon.
FROM oven/bun:1 AS runtime
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile

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
CMD ["sh", "-c", "sh scripts/setup.sh && bun run src/index.ts"]
