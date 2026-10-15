const FEATURES = [
  {
    title: "Credentials never leave your machine",
    description:
      "Your database passwords are encrypted before being saved and never appear in logs, API responses, or error messages. Only the local gateway process decrypts them at query time.",
    badge: "Security",
    accent: false,
  },
  {
    title: "Mutations blocked at proxy level",
    description:
      "Every query is validated as read-only before it hits your database. INSERT, UPDATE, DELETE, DROP, CREATE, and ALTER statements are halted at the gateway.",
    badge: "Safety",
    accent: true,
  },
  {
    title: "Automatic result set row capping",
    description:
      "Queries default to a 100-row cap to protect against runaway queries exhausting your machine's memory or bloating your AI model's context window.",
    badge: "Performance",
    accent: false,
  },
  {
    title: "Works with all major AI tooling",
    description:
      "Exposes standard MCP tools that plug seamlessly into Claude Code, Cursor, Windsurf, Claude Desktop, and custom MCP clients.",
    badge: "Compatibility",
    accent: false,
  },
  {
    title: "AI sees schema, not raw secrets",
    description:
      "Your assistant interfaces strictly through the MCP gateway. It never sees connection strings, passwords, or raw socket credentials.",
    badge: "Privacy",
    accent: true,
  },
  {
    title: "Environment and service tagging",
    description:
      "Categorize connections by environment (prod, staging, dev) and service name so your assistant always retains accurate contextual scope.",
    badge: "Organization",
    accent: false,
  },
];

export function FeatureGrid() {
  return (
    <section className="mb-20 sm:mb-28">
      <div className="max-w-2xl mb-12">
        <span className="text-xs text-[#737373] uppercase tracking-wider block mb-2 font-normal">
          Architecture
        </span>
        <h2 className="text-3xl sm:text-4xl font-medium text-[#0A0A0A] tracking-tight leading-tight">
          Built to keep AI assistants in their lane
        </h2>
        <p className="text-base text-[#4D4D4D] mt-3 leading-relaxed">
          Read-only exploration for models. Complete operational control for engineers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="group rounded-[14px] bg-white p-7 border border-[#EEEEEE] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] hover:border-[#CCCCCC] transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="mb-4">
                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full ${
                  f.accent
                    ? "bg-[#22C55E]/10 text-[#15803D] border border-[#22C55E]/20"
                    : "bg-[#EEEEEE] text-[#4D4D4D] border border-[#E5E5E5]"
                }`}>
                  {f.accent && <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />}
                  {f.badge}
                </span>
              </div>
              <h3 className="text-base font-medium text-[#0A0A0A] mb-2.5 leading-snug">
                {f.title}
              </h3>
              <p className="text-sm text-[#4D4D4D] leading-relaxed">
                {f.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
