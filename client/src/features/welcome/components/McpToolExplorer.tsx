import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface ToolInfo {
  name: string;
  description: string;
  parameters: string;
  sampleResponse: string;
}

const MCP_TOOLS: ToolInfo[] = [
  {
    name: "list_databases",
    description: "Returns all enabled database connections exposed via the control plane.",
    parameters: "{ }",
    sampleResponse: `{
  "databases": [
    {
      "database_id": "91aa54fd-c9d2-45d9-9bbd-9f3c67f8f9fc",
      "name": "Payments Staging",
      "type": "postgresql",
      "database_name": "payments_db",
      "environment": "staging"
    }
  ],
  "hint": "Use 'database_id' in all other tool calls."
}`,
  },
  {
    name: "get_database_schema",
    description: "Lists tables in a database, with optional case-insensitive name filtering.",
    parameters: `{
  "database_id": "91aa54fd-c9d2-45d9-9bbd-9f3c67f8f9fc",
  "filter": "payment"
}`,
    sampleResponse: `{
  "database": "Payments Staging",
  "type": "postgresql",
  "table_count": 2,
  "tables": [
    { "table_name": "payment_events", "table_type": "BASE TABLE" },
    { "table_name": "payment_attempts", "table_type": "BASE TABLE" }
  ],
  "table_names": ["payment_events", "payment_attempts"]
}`,
  },
  {
    name: "get_table_schema",
    description: "Returns columns, indexes, and foreign keys for a selected table.",
    parameters: `{
  "database_id": "91aa54fd-c9d2-45d9-9bbd-9f3c67f8f9fc",
  "table_name": "payment_events"
}`,
    sampleResponse: `{
  "database": "Payments Staging",
  "type": "postgresql",
  "table": "payment_events",
  "columns": [
    { "column_name": "id", "data_type": "uuid", "is_nullable": "NO" },
    { "column_name": "event_type", "data_type": "text", "is_nullable": "NO" },
    { "column_name": "created_at", "data_type": "timestamp with time zone", "is_nullable": "NO" }
  ],
  "indexes": [
    { "index_name": "payment_events_pkey", "column_name": "id", "is_unique": true, "is_primary": true }
  ],
  "foreignKeys": []
}`,
  },
  {
    name: "execute_read_query",
    description: "Executes read-only SQL (SELECT, EXPLAIN, SHOW, DESCRIBE). LIMIT is auto-injected for SELECT if omitted.",
    parameters: `{
  "database_id": "91aa54fd-c9d2-45d9-9bbd-9f3c67f8f9fc",
  "query": "SELECT id, event_type FROM payment_events ORDER BY created_at DESC",
  "limit": 5
}`,
    sampleResponse: `{
  "row_count": 2,
  "truncated": false,
  "columns": ["id", "event_type"],
  "rows": [
    { "id": "evt_01", "event_type": "payment.captured" },
    { "id": "evt_02", "event_type": "payment.failed" }
  ],
  "hint": "Query returned 2 row(s). Use get_table_schema to explore table structure."
}`,
  },
];

export function McpToolExplorer() {
  const [activeIdx, setActiveIdx] = useState(0);
  const activeTool = MCP_TOOLS[activeIdx];

  return (
    <div className="bg-background rounded-3xl p-6 sm:p-8 border border-border shadow-sm mb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <span className="text-xs font-bold text-primary uppercase tracking-widest">
            What your AI can do
          </span>
          <h2 className="text-2xl font-bold text-foreground tracking-tight mt-1">
            4 tools, zero risk
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Every AI tool call goes through one of these four read-only operations
          </p>
        </div>

        {/* Tool selector buttons */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border overflow-x-auto">
          {MCP_TOOLS.map((t, idx) => (
            <button
              key={t.name}
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-lg transition-all shrink-0 ${
                activeIdx === idx
                  ? "bg-background text-primary shadow-2xs"
                  : "text-muted-foreground hover:text-muted-foreground"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Active tool view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Description & Parameters */}
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30">
            <h3 className="text-base font-mono font-bold text-primary">
              {activeTool.name}
            </h3>
            <p className="text-xs sm:text-sm text-primary mt-1 leading-relaxed">
              {activeTool.description}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Parameters JSON Schema
            </p>
            <pre className="text-xs text-muted-foreground bg-muted p-4 rounded-xl border border-border font-mono overflow-x-auto">
              {activeTool.parameters}
            </pre>
          </div>
        </div>

        {/* Sample Output */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Sample Response Payload
          </p>
          <pre className="text-xs text-primary bg-muted p-4 rounded-xl border border-border font-mono overflow-x-auto h-[220px]">
            {activeTool.sampleResponse}
          </pre>
        </div>
      </div>
    </div>
  );
}
