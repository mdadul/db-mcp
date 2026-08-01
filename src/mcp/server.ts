import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { listDatabases } from "./tools/listDatabases.ts";
import { getDatabaseSchema } from "./tools/getDatabaseSchema.ts";
import { getTableSchema } from "./tools/getTableSchema.ts";
import { executeReadQuery } from "./tools/executeReadQuery.ts";
import { MAX_ROWS } from "../query/safety.ts";
import { logToolCall } from "../db/logToolCall.ts";

// ---------------------------------------------------------------------------
// Tool registration — called for each new session's McpServer instance
// ---------------------------------------------------------------------------

function registerTools(server: McpServer) {
  server.registerTool(
    "list_databases",
    {
      description:
        "List all enabled databases. Call this first to get database_id values required by all other tools. Each result includes 'database_id' (use this in other tool calls), 'name', 'type' (mysql|postgresql), and 'database_name'.",
      inputSchema: {},
    },
    async () => {
      logToolCall("list_databases");
      return { content: [{ type: "text", text: await listDatabases() }] };
    }
  );

  server.registerTool(
    "get_database_schema",
    {
      description:
        "List tables in a database. Use the optional 'filter' to search by name (e.g. 'workorder' returns all tables containing that word). Omit filter to list all tables. Always call this before get_table_schema.",
      inputSchema: {
        database_id: z.string().describe("The database ID returned by list_databases."),
        filter: z.string().optional().describe("Optional substring to filter table names (case-insensitive)."),
      },
    },
    async ({ database_id, filter }) => {
      logToolCall("get_database_schema", "success", database_id);
      return { content: [{ type: "text", text: await getDatabaseSchema(database_id, filter) }] };
    }
  );

  server.registerTool(
    "get_table_schema",
    {
      description: "Get the full column structure, indexes, and foreign keys for a specific table.",
      inputSchema: {
        database_id: z.string().describe("The database ID returned by list_databases."),
        table_name: z.string().describe("The table name."),
      },
    },
    async ({ database_id, table_name }) => {
      logToolCall("get_table_schema", "success", database_id);
      return { content: [{ type: "text", text: await getTableSchema(database_id, table_name) }] };
    }
  );

  server.registerTool(
    "execute_read_query",
    {
      description:
        "Execute a read-only SQL query (SELECT, EXPLAIN, DESCRIBE, SHOW). Write operations are blocked. A LIMIT is automatically injected if omitted. Use the 'limit' argument to control row count (default 100, max 1000). Pass 'database_id' from list_databases.",
      inputSchema: {
        database_id: z.string().describe("The database ID returned by list_databases."),
        query: z.string().describe("The SQL query to execute."),
        limit: z.number().int().min(1).max(1000).optional().describe(`Maximum rows to return (default: ${MAX_ROWS}).`),
      },
    },
    async ({ database_id, query, limit }) => {
      try {
        const text = await executeReadQuery(database_id, query, limit);
        const isError = text.includes('"error"');
        logToolCall("execute_read_query", isError ? "error" : "success", database_id);
        return { content: [{ type: "text", text }] };
      } catch (err) {
        logToolCall("execute_read_query", "error", database_id);
        return {
          isError: true,
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
        };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// HTTP transport — stateless, one server+transport per request (no session map)
// ---------------------------------------------------------------------------

export async function handleMcpRequest(req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    // no sessionIdGenerator = stateless mode; survives server restarts cleanly
  });

  const server = new McpServer({ name: "db-mcp", version: "1.0.0" });
  registerTools(server);
  await server.connect(transport);
  return transport.handleRequest(req);
}

