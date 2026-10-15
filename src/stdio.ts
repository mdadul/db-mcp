import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp/server.ts";
import { runMigrations } from "./db/runMigrations.ts";

// stdout carries the MCP protocol, so every log below goes to stderr.
// No bearer token here: the client spawns this process and it reads the local .env.
await runMigrations();

const server = createMcpServer();
await server.connect(new StdioServerTransport());
console.error("db-mcp stdio server ready");

// Stdio ends when the client closes stdin; then release resources and exit.
process.stdin.on("end", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
  process.exit(1);
});
