import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appSupport = join(homedir(), "Library", "Application Support", "dev.dbmcp.desktop");
const realDatabase = join(appSupport, "db-mcp.sqlite");
const previewDirectory = mkdtempSync(join(tmpdir(), "dbmcp-ui-preview-"));
const fallbackDatabase = join(root, "data", "ui-preview.sqlite");
const ownsFallbackDatabase = !existsSync(realDatabase) && !existsSync(fallbackDatabase);
const previewDatabase = existsSync(realDatabase) ? join(previewDirectory, "db-mcp.sqlite") : fallbackDatabase;
const backendPort = Number(process.env.UI_PREVIEW_PORT ?? 4080);
if (existsSync(realDatabase)) copyFileSync(realDatabase, previewDatabase);
else mkdirSync(join(root, "data"), { recursive: true });

const keyPath = join(appSupport, "encryption.key");
const encryptionKey = existsSync(keyPath) ? readFileSync(keyPath, "utf8").trim() : randomBytes(32).toString("hex");
if (!/^[\da-fA-F]{64}$/.test(encryptionKey)) {
  rmSync(previewDirectory, { recursive: true, force: true });
  throw new Error("The local encryption.key file is not a valid 64-character hexadecimal key");
}

const env = {
  ...process.env,
  HOST: "127.0.0.1",
  VITE_DEV_BACKEND_PORT: String(backendPort),
  VITE_DEV_SESSION_TOKEN: "dev",
  PORT: String(backendPort),
  APP_SESSION_TOKEN: "dev",
  ALLOWED_ORIGINS: "http://localhost:5173",
  DATABASE_PATH: previewDatabase,
  ENCRYPTION_KEY: encryptionKey,
};

const children = [];
let stopping = false;

function start(command, args, options) {
  const child = spawn(command, args, { cwd: root, env, stdio: ["pipe", "inherit", "inherit"], detached: process.platform !== "win32", ...options });
  child.on("error", (error) => { process.stderr.write(`Could not start ${command}: ${error.message}\n`); void stop(1); });
  child.once("exit", (code, signal) => {
    if (!stopping && (code !== 0 || signal)) {
      process.stderr.write(`${command} exited before the preview was stopped.\n`);
      void stop(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  const signalChild = (child, signal) => {
    if (child.exitCode !== null || !child.pid) return;
    try { process.kill(process.platform === "win32" ? child.pid : -child.pid, signal); }
    catch { child.kill(signal); }
  };
  for (const child of children) signalChild(child, "SIGTERM");
  await Promise.all(children.map((child) => new Promise((resolveExit) => {
    if (child.exitCode !== null) { resolveExit(); return; }
    const timer = setTimeout(() => { signalChild(child, "SIGKILL"); resolveExit(); }, 5000);
    child.once("exit", () => { clearTimeout(timer); resolveExit(); });
  })));
  if (previewDatabase.startsWith(previewDirectory)) rmSync(previewDirectory, { recursive: true, force: true });
  if (ownsFallbackDatabase) {
    rmSync(fallbackDatabase, { force: true });
    rmSync(`${fallbackDatabase}-wal`, { force: true });
    rmSync(`${fallbackDatabase}-shm`, { force: true });
  }
  if (ownsFallbackDatabase) {
    try { rmSync(join(root, "data"), { recursive: false }); } catch { /* Keep the directory if another process added content. */ }
  }
  process.exit(exitCode);
}

process.once("SIGINT", () => void stop(0));
process.once("SIGTERM", () => void stop(0));

start(process.execPath, ["src/index.ts"], { stdio: ["pipe", "inherit", "inherit"] });
start("bun", ["run", "--cwd", "client", "dev", "--host", "127.0.0.1"], { stdio: ["ignore", "inherit", "inherit"] });
process.stdout.write("DB MCP UI preview is starting at http://localhost:5173 (Ctrl+C to stop both processes).\n");
