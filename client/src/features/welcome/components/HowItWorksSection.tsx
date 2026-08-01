import { Database, CheckCircle2, ClipboardPaste, Sparkles } from "@/components/ui/Icons";

const STEPS = [
  {
    step: "01",
    title: "Add your database",
    description:
      "Enter your host, port, database name, and a read-only user's credentials. Your password is encrypted immediately — it's never stored or logged in plain text.",
    icon: Database,
  },
  {
    step: "02",
    title: "Verify it connects",
    description:
      "Hit Test Connection to confirm everything works. The gateway pings the database and reports back in seconds — no guessing.",
    icon: CheckCircle2,
  },
  {
    step: "03",
    title: "Copy the config snippet",
    description:
      "Pick your AI tool (Claude Code, Cursor, Windsurf, or Claude.ai Web) and copy the one-liner or JSON config. Done in under a minute.",
    icon: ClipboardPaste,
  },
  {
    step: "04",
    title: "Ask your AI anything about your DB",
    description:
      "Your AI can now explore schemas, inspect tables, and run read-only queries. It can never insert, update, delete, or drop anything.",
    icon: Sparkles,
  },
];

export function HowItWorksSection() {
  return (
    <div className="mb-12">
      <div className="text-center max-w-2xl mx-auto mb-8">
        <h2 className="text-2xl font-bold text-foreground tracking-tight">
          Up and running in 4 steps
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          From zero to AI-powered database queries in under 5 minutes
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {STEPS.map((s) => (
          <div
            key={s.step}
            className="bg-background rounded-2xl p-6 border border-border shadow-sm relative overflow-hidden flex items-start gap-4 hover:border-primary/30 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-primary uppercase tracking-widest">
                  Step {s.step}
                </span>
              </div>
              <h3 className="text-base font-bold text-foreground mb-1">
                {s.title}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {s.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
