import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { listDatabases } from "./tools/listDatabases.ts";
import { getDatabaseSchema } from "./tools/getDatabaseSchema.ts";
import { getTableSchema } from "./tools/getTableSchema.ts";
import { executeReadQuery } from "../api/routes/databases/service.ts";
import { MAX_ROWS } from "../query/safety.ts";
import { logToolCall } from "../db/logToolCall.ts";
import { VERSION } from "../version.ts";

// ---------------------------------------------------------------------------
// Tool registration — called for each new session's McpServer instance
// ---------------------------------------------------------------------------

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Run a tool, log the real outcome, and flag failures with isError. Tools return JSON strings; a top-level "error" key means failure. */
async function runTool(tool: string, databaseId: string | undefined, fn: () => Promise<string>) {
  let text: string;
  let failed = false;
  try {
    text = await fn();
    try {
      failed = typeof JSON.parse(text)?.error === "string";
    } catch {
      // non-JSON output is treated as success
    }
  } catch (err) {
    failed = true;
    text = JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
      hint: "Call list_databases to verify database_id, then retry.",
    });
  }
  logToolCall(tool, failed ? "error" : "success", databaseId);
  return { ...(failed && { isError: true }), content: [{ type: "text" as const, text }] };
}

function registerTools(server: McpServer) {
  server.registerTool(
    "list_databases",
    {
      description:
        "List all enabled databases. Call this first to get database_id values required by all other tools. Each result includes 'database_id' (use this in other tool calls), 'name', 'type' (postgresql|mysql|sqlite|redshift|mongodb), and 'database_name'.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => runTool("list_databases", undefined, listDatabases)
  );

  server.registerTool(
    "get_database_schema",
    {
      description:
        "List tables (or collections) in a database. Use the optional 'filter' to search by name (e.g. 'workorder' returns all tables containing that word). Omit filter to list all. Always call this before get_table_schema.",
      inputSchema: {
        database_id: z.string().describe("The database ID returned by list_databases."),
        filter: z.string().optional().describe("Optional substring to filter table names (case-insensitive)."),
      },
      annotations: READ_ONLY,
    },
    ({ database_id, filter }) =>
      runTool("get_database_schema", database_id, () => getDatabaseSchema(database_id, filter))
  );

  server.registerTool(
    "get_table_schema",
    {
      description: "Get the full column structure, indexes, and foreign keys for a specific table.",
      inputSchema: {
        database_id: z.string().describe("The database ID returned by list_databases."),
        table_name: z.string().describe("The table name."),
      },
      annotations: READ_ONLY,
    },
    ({ database_id, table_name }) =>
      runTool("get_table_schema", database_id, () => getTableSchema(database_id, table_name))
  );

  server.registerTool(
    "execute_read_query",
    {
      description:
        "Execute a read-only query. SQL databases: SELECT, EXPLAIN, DESCRIBE, SHOW (a LIMIT is injected if omitted). MongoDB: a JSON object such as {\"collection\":\"orders\",\"filter\":{}}. Write operations are blocked. Use 'limit' to control row count (default 100, max 1000). Pass 'database_id' from list_databases.",
      inputSchema: {
        database_id: z.string().describe("The database ID returned by list_databases."),
        query: z.string().describe("The SQL query (or MongoDB JSON query) to execute."),
        limit: z.number().int().min(1).max(1000).optional().describe(`Maximum rows to return (default: ${MAX_ROWS}).`),
      },
      annotations: READ_ONLY,
    },
    ({ database_id, query, limit }) =>
      runTool("execute_read_query", database_id, () => executeReadQuery(database_id, query, limit))
  );
}

// ---------------------------------------------------------------------------
// HTTP transport — stateless, one server+transport per request (no session map)
// ---------------------------------------------------------------------------

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "db-mcp", version: VERSION });
  registerTools(server);
  return server;
}

export async function handleMcpRequest(req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    // no sessionIdGenerator = stateless mode; survives server restarts cleanly
  });

  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(req);
}

