const FEATURES = [
  {
    title: "Credentials never leave your machine",
    description:
      "Your database passwords are encrypted before being saved and never appear in logs, API responses, or error messages. Only the gateway process can decrypt them, and only at query time.",
    badge: "Security",
    badgeVariant: "success",
  },
  {
    title: "AI can't modify your data — ever",
    description:
      "Every query is validated as read-only before it hits the database. INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, and TRUNCATE are blocked at the gateway, not just suggested by a prompt.",
    badge: "Safety",
    badgeVariant: "info",
  },
  {
    title: "Results are always capped",
    description:
      "Queries automatically get a row cap (default 100, max 1000) to protect against runaway queries flooding your AI's context window or exhausting memory.",
    badge: "Performance",
    badgeVariant: "warning",
  },
  {
    title: "Works with all major AI tools",
    description:
      "Exposes four standard MCP tools — list databases, list tables, inspect a table, run a query — that work out of the box with Claude Code, Cursor, Windsurf, and Claude.ai.",
    badge: "MCP Ready",
    badgeVariant: "info",
  },
  {
    title: "AI sees schema, not secrets",
    description:
      "Your AI tool connects through the MCP endpoint only. It never sees raw connection strings, passwords, or host credentials — just the query results you ask for.",
    badge: "Privacy",
    badgeVariant: "success",
  },
  {
    title: "Organize by environment and team",
    description:
      "Tag each connection with an environment (prod, staging, dev) and a service name so your AI always has context about which database it's talking to.",
    badge: "Organization",
    badgeVariant: "neutral",
  },
];

export function FeatureGrid() {
  return (
    <div className="mb-12">
      <div className="text-center max-w-2xl mx-auto mb-8">
        <h2 className="text-2xl font-bold text-foreground tracking-tight">
          Built to keep AI in its lane
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Read access for your AI. Full control for you.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="bg-background rounded-2xl p-6 border border-border shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
                  {f.badge}
                </span>
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">
                {f.title}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {f.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
