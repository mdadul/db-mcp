import { Database, CheckCircle2, ClipboardPaste, Sparkles } from "@/components/ui/Icons";

const STEPS = [
  {
    step: "01",
    title: "Add database connection",
    description:
      "Enter your host, port, database name, and read-only credentials. Passwords are encrypted with AES-256 immediately upon saving.",
    icon: Database,
  },
  {
    step: "02",
    title: "Verify connection health",
    description:
      "Test connectivity directly from the control plane with a single click before wiring into your AI assistant.",
    icon: CheckCircle2,
  },
  {
    step: "03",
    title: "Copy the MCP config snippet",
    description:
      "Select your AI client — Claude Code, Cursor, Windsurf, or Claude Desktop — and paste the configuration into your local settings.",
    icon: ClipboardPaste,
  },
  {
    step: "04",
    title: "Explore schema and query",
    description:
      "Your assistant discovers database tables, columns, indexes, and executes safe read-only queries with capped result sets.",
    icon: Sparkles,
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="mb-20 sm:mb-28">
      <div className="max-w-2xl mb-12">
        <span className="text-xs text-[#737373] uppercase tracking-wider block mb-2 font-normal">
          Workflow
        </span>
        <h2 className="text-3xl sm:text-4xl font-medium text-[#0A0A0A] tracking-tight leading-tight">
          Up and running in four steps
        </h2>
        <p className="text-base text-[#4D4D4D] mt-3 leading-relaxed">
          From zero to AI-assisted database exploration in less than five minutes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {STEPS.map((s) => (
          <div
            key={s.step}
            className="group rounded-[14px] bg-white p-7 border border-[#EEEEEE] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] hover:border-[#CCCCCC] transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-11 h-11 rounded-[10px] bg-[#F8F8F8] border border-[#EEEEEE] text-[#0A0A0A] flex items-center justify-center transition-colors group-hover:bg-[#E5E5E5]">
                  <s.icon className="w-5 h-5 text-[#4D4D4D]" />
                </div>
                <span className="text-xs font-mono text-[#737373] bg-[#F8F8F8] px-2.5 py-1 rounded-[6px] border border-[#EEEEEE]">
                  {s.step}
                </span>
              </div>
              <h3 className="text-lg font-medium text-[#0A0A0A] mb-2 leading-snug">
                {s.title}
              </h3>
              <p className="text-sm text-[#4D4D4D] leading-relaxed">
                {s.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
