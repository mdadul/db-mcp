import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

export function HeroSection() {
  return (
    <div className="relative overflow-hidden bg-linear-to-b from-background via-muted to-accent text-foreground rounded-3xl p-8 sm:p-12 mb-12 shadow-xl border border-primary/30">
      {/* Decorative ambient background blur */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold uppercase tracking-wider mb-6">
          <span className="w-2 h-2 rounded-full bg-primary/10 animate-pulse" />
          Self-Hosted · Open Source
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight leading-tight mb-4">
          Let your AI assistant query your database —{" "}
          <span className="text-primary">
            safely.
          </span>
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mb-8">
          Give Claude Code, Cursor, Windsurf, or any MCP-compatible AI tool
          read-only access to your PostgreSQL and MySQL databases.
          Credentials never leave your machine. AI can never modify your data.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <Link to="/new">
            <Button
              variant="default"
              size="lg"
              className="font-semibold shadow-lg shadow-primary/20"
            >
              + Add Your First Database
            </Button>
          </Link>
          <Link to="/welcome">
            <Button
              variant="outline"
              size="lg"
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              See how it works →
            </Button>
          </Link>
        </div>

        {/* Quick Highlights Pill Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-10 mt-10 border-t border-border text-left">
          <div>
            <p className="text-xl font-bold text-foreground">Encrypted</p>
            <p className="text-xs text-muted-foreground mt-0.5">Credentials at rest</p>
          </div>
          <div>
            <p className="text-xl font-bold text-primary">Read-Only</p>
            <p className="text-xs text-muted-foreground mt-0.5">AI can't touch your data</p>
          </div>
          <div>
            <p className="text-xl font-bold text-primary">All AI Tools</p>
            <p className="text-xs text-muted-foreground mt-0.5">Claude, Cursor, Windsurf…</p>
          </div>
          <div>
            <p className="text-xl font-bold text-primary">Self-Hosted</p>
            <p className="text-xs text-muted-foreground mt-0.5">Nothing leaves your machine</p>
          </div>
        </div>
      </div>
    </div>
  );
}
