import { Link } from "react-router-dom";
import { Lock, ShieldCheck, Sparkles, Server, ArrowRight } from "@/components/ui/Icons";

const HIGHLIGHTS = [
  { icon: Lock, label: "Encrypted at rest", sub: "Credentials encrypted with AES-256" },
  { icon: ShieldCheck, label: "Read-only guardrail", sub: "AI cannot mutate your tables" },
  { icon: Sparkles, label: "MCP compliant", sub: "Claude Code, Cursor, Windsurf" },
  { icon: Server, label: "Self-hosted", sub: "Data stays entirely on your system" },
];

export function HeroSection() {
  return (
    <section className="mb-20 sm:mb-28">
      {/* Eyebrow / Tag */}
      <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EEEEEE] border border-[#E5E5E5] text-xs text-[#4D4D4D]">
        <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
        <span>Open Source · Model Context Protocol</span>
      </div>

      {/* Editorial Main Headline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start mb-12 sm:mb-16">
        <div className="lg:col-span-8">
          <h1 className="text-4xl sm:text-6xl lg:text-[72px] font-medium text-[#0A0A0A] leading-[1.08] tracking-[-0.035em] mb-6">
            Let your AI query your database — safely.
          </h1>
          <p className="text-lg sm:text-xl text-[#4D4D4D] leading-relaxed max-w-2xl font-normal">
            Give Claude Code, Cursor, Windsurf, or any MCP-compatible AI assistant secure,
            read-only exploration of your PostgreSQL and MySQL schemas. Credentials stay
            encrypted on your machine.
          </p>
        </div>

        {/* Right side quick bio/intro card */}
        <div className="lg:col-span-4 lg:pt-2">
          <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[#EEEEEE]">
              <div className="w-10 h-10 rounded-[10px] bg-[#E5E5E5] flex items-center justify-center text-[#0A0A0A]">
                <ShieldCheck className="w-5 h-5 text-[#0A0A0A]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0A0A0A]">Zero-Risk Gateway</p>
                <p className="text-xs text-[#737373]">Read-only enforced at proxy</p>
              </div>
            </div>
            <p className="text-xs text-[#4D4D4D] leading-relaxed">
              Every query is parsed and verified before hitting your database. INSERT, UPDATE, DELETE, and DROP operations are blocked unconditionally.
            </p>
            <div className="pt-2">
              <Link
                to="/new"
                className="inline-flex items-center justify-center w-full h-[46px] rounded-[10px] bg-[#E5E5E5] hover:bg-[#DCDCDC] text-[#0A0A0A] text-sm font-normal transition-colors gap-2"
              >
                <span>Add your first database</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Action Buttons */}
      <div className="flex flex-wrap items-center gap-4 mb-16 sm:mb-20">
        <Link
          to="/new"
          className="inline-flex items-center justify-center h-[56px] px-8 rounded-[10px] bg-[#E5E5E5] hover:bg-[#DCDCDC] text-[#0A0A0A] text-base font-normal transition-colors"
        >
          Add connection
        </Link>
        <a
          href="#how-it-works"
          className="inline-flex items-center justify-center h-[56px] px-8 rounded-[10px] bg-white hover:border-[#CCCCCC] border border-[#EEEEEE] text-[#4D4D4D] hover:text-[#0A0A0A] text-base font-normal shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all"
        >
          How it works
        </a>
      </div>

      {/* Highlights Strip */}
      <div className="rounded-[14px] border border-[#EEEEEE] bg-white p-2 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.03)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#EEEEEE]">
          {HIGHLIGHTS.map(({ icon: Icon, label, sub }) => (
            <div key={label} className="p-5 flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-[8px] bg-[#F8F8F8] border border-[#EEEEEE] flex items-center justify-center text-[#4D4D4D] shrink-0 mt-0.5">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0A0A0A]">{label}</p>
                <p className="text-xs text-[#737373] mt-0.5 leading-normal">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
