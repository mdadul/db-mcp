import { useState } from "react";

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
    parameters: `{ }`,
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
    <section className="mb-20 sm:mb-28 rounded-[14px] bg-white p-7 sm:p-10 border border-[#EEEEEE] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)]">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pb-6 border-b border-[#EEEEEE]">
        <div>
          <span className="text-xs text-[#737373] uppercase tracking-wider block mb-2 font-normal">
            Tool Specification
          </span>
          <h2 className="text-2xl sm:text-3xl font-medium text-[#0A0A0A] tracking-tight">
            Four core MCP operations
          </h2>
          <p className="text-sm text-[#4D4D4D] mt-1.5 leading-relaxed">
            Every assistant action maps to one of these safe, read-only primitive handlers.
          </p>
        </div>

        {/* Tool selector buttons */}
        <div className="flex items-center gap-1.5 bg-[#F8F8F8] p-1.5 rounded-[10px] border border-[#EEEEEE] overflow-x-auto">
          {MCP_TOOLS.map((t, idx) => (
            <button
              key={t.name}
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-1.5 text-xs font-mono rounded-[8px] transition-colors shrink-0 cursor-pointer ${
                activeIdx === idx
                  ? "bg-[#E5E5E5] text-[#0A0A0A] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  : "text-[#4D4D4D] hover:text-[#0A0A0A] hover:bg-white"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Active tool view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Description & Parameters */}
        <div className="space-y-5">
          <div className="p-5 rounded-[10px] bg-[#F8F8F8] border border-[#EEEEEE]">
            <h3 className="text-sm font-mono font-semibold text-[#0A0A0A]">
              {activeTool.name}
            </h3>
            <p className="text-sm text-[#4D4D4D] mt-2 leading-relaxed">
              {activeTool.description}
            </p>
          </div>

          <div>
            <p className="text-xs text-[#737373] uppercase tracking-wider mb-2 font-normal">
              Parameters Schema
            </p>
            <pre className="text-xs text-[#4D4D4D] bg-[#FAFAFA] p-4 rounded-[10px] border border-[#EEEEEE] font-mono overflow-x-auto">
              {activeTool.parameters}
            </pre>
          </div>
        </div>

        {/* Sample Output */}
        <div>
          <p className="text-xs text-[#737373] uppercase tracking-wider mb-2 font-normal">
            Sample Output Response
          </p>
          <pre className="text-xs text-[#0A0A0A] bg-[#FAFAFA] p-4 rounded-[10px] border border-[#EEEEEE] font-mono overflow-x-auto h-[260px] leading-relaxed">
            {activeTool.sampleResponse}
          </pre>
        </div>
      </div>
    </section>
  );
}
