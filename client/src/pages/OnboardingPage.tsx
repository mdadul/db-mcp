import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Database, LockKeyhole, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ConnectionForm } from "@/features/databases/components/ConnectionForm";
import { AiClientList } from "@/features/ai-clients/components/AiClientList";
import { useServerInfo, useUpdateSettings } from "@/platform/hooks";
import type { DatabaseConnection } from "@/features/databases/types";
import { databaseApi } from "@/features/databases/api/databaseApi";

const STEPS = ["Welcome", "Add a database", "Connect an AI client"] as const;
const PROGRESS_KEY = "dbmcp.onboardingProgress.v1";
type Progress = { step: number; connectionId: string | null };

function readProgress(): Progress {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null");
    if (typeof saved !== "object" || saved === null) return { step: 0, connectionId: null };
    const data = saved as Partial<Progress>;
    const step = typeof data.step === "number" && Number.isInteger(data.step) ? Math.min(2, Math.max(0, data.step)) : 0;
    const connectionId = typeof data.connectionId === "string" ? data.connectionId : null;
    return { step, connectionId };
  } catch { return { step: 0, connectionId: null }; }
}

export function OnboardingPage() {
  const [progress, setProgress] = useState<Progress>(readProgress);
  const [created, setCreated] = useState<DatabaseConnection | null>(null);
  const [connectionTest, setConnectionTest] = useState<{ state: "testing" | "success" | "error"; message: string }>({ state: "testing", message: "Checking the connection…" });
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: serverInfo } = useServerInfo();
  const updateSettings = useUpdateSettings();
  const step = progress.step;
  useEffect(() => { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); }, [progress]);

  useEffect(() => {
    if (!progress.connectionId) return;
    let active = true;
    void databaseApi.getById(progress.connectionId).then((connection) => { if (active) setCreated(connection); }).catch(() => {
      if (active) setProgress((current) => ({ ...current, connectionId: null }));
    });
    return () => { active = false; };
  }, [progress.connectionId]);

  useEffect(() => {
    if (!created) return;
    let active = true;
    setConnectionTest({ state: "testing", message: "Checking the connection…" });
    void databaseApi.testConnection(created.id).then((result) => {
      if (!active) return;
      setConnectionTest(result.success
        ? { state: "success", message: `Connection test passed${result.latencyMs === undefined ? "." : ` in ${result.latencyMs} ms.`}` }
        : { state: "error", message: `${result.message}${result.hint ? ` ${result.hint}` : ""}` });
    }).catch((error: unknown) => { if (active) setConnectionTest({ state: "error", message: error instanceof Error ? error.message : "Could not test this connection." }); });
    return () => { active = false; };
  }, [created]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.matches("input, textarea, select, [contenteditable='true']") || target.closest("[role='dialog']") !== null);
      if (event.key === "Escape" && !skipConfirm) { event.preventDefault(); setSkipConfirm(true); }
      if (event.key === "Enter" && !typing && !skipConfirm) { event.preventDefault(); runPrimary(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, created, skipConfirm, updateSettings.isPending]);

  useEffect(() => {
    if (!searchParams.get("connection")) return;
    void databaseApi.list().then((connections) => {
      const selected = connections.find((connection) => connection.id === searchParams.get("connection"));
      if (selected) { setCreated(selected); setProgress({ step: 1, connectionId: selected.id }); }
    }).catch(() => undefined);
  }, [searchParams]);

  const setStep = (nextStep: number) => setProgress((current) => ({ ...current, step: Math.min(2, Math.max(0, nextStep)) }));
  const finish = async (selectCreatedConnection = true) => {
    try {
      await updateSettings.mutateAsync({ onboardingCompleted: true });
      localStorage.removeItem(PROGRESS_KEY);
      navigate(selectCreatedConnection && created ? `/connections/${created.id}` : "/connections", { replace: true });
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Could not finish setup"); }
  };
  const skip = () => { setSkipConfirm(false); void finish(false); };
  const runPrimary = () => {
    if (step === 0) setStep(1);
    else if (step === 1) { if (created) setStep(2); else document.querySelector<HTMLButtonElement>("form button[type='submit']")?.click(); }
    else void finish();
  };
  const onCreated = (connection: DatabaseConnection) => {
    setCreated(connection);
    setProgress({ step: 1, connectionId: connection.id });
  };

  return <main className="fixed inset-0 z-40 flex min-h-0 flex-col overflow-y-auto bg-background px-5 py-5 sm:px-8 sm:py-7" aria-label="Welcome setup">
    <div className="flex shrink-0 items-center gap-2 text-[12px] font-semibold"><span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><Database className="size-4" /></span>db-mcp</div>
    <Button className="absolute right-5 top-5 sm:right-8 sm:top-7" variant="ghost" size="sm" onClick={() => setSkipConfirm(true)}>Skip setup</Button>
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-8">
      <ol aria-label="Setup progress" className="mb-8 grid grid-cols-3 gap-3">{STEPS.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`flex items-center gap-2 border-b-2 pb-2.5 text-[11px] transition-colors duration-150 ${step === index ? "border-primary font-semibold text-foreground" : step > index ? "border-primary/40 text-muted-foreground" : "border-border text-muted-foreground"}`}><span className={`flex size-5 items-center justify-center rounded-full text-[10px] ${step > index ? "bg-primary/10 text-primary" : step === index ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{step > index ? <Check className="size-3" /> : index + 1}</span><span className="truncate">{label}</span></li>)}</ol>
      <div key={step} className="animate-in fade-in slide-in-from-bottom-1 duration-150 motion-reduce:animate-none">
        {step === 0 && <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="size-5" /></div>
          <h1 className="text-xl font-semibold tracking-tight">Your databases, ready for AI.</h1>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">Give your AI tools safe, read-only access to your databases. Everything stays on this computer.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">{[
            { icon: LockKeyhole, title: "Encrypted locally", copy: "Credentials stay on this computer." },
            { icon: CheckCircle2, title: "Read-only queries", copy: "AI tools can explore, not change data." },
            { icon: Database, title: "Works with your AI clients", copy: "Connect the tools you already use." },
          ].map(({ icon: Icon, title, copy }) => <div key={title} className="flex items-start gap-2.5 rounded-md bg-muted/50 p-3"><Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-[12px] font-medium">{title}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{copy}</p></div></div>)}</div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={() => void finish(false)} disabled={updateSettings.isPending}>I’ll do it later</Button><Button onClick={runPrimary}>Add a database<ChevronRight data-icon="inline-end" /></Button></div>
        </section>}
        {step === 1 && <section className="rounded-xl border border-border bg-card p-5 sm:p-7"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-lg font-semibold">Add a database</h1><p className="mt-1 text-[12px] text-muted-foreground">Connect one now, or come back to this later.</p></div>{created && <Button variant="ghost" size="sm" onClick={() => { setCreated(null); setProgress((current) => ({ ...current, connectionId: null })); }}>Add another</Button>}</div>
          {created ? <div className="rounded-md border border-border bg-muted/30 p-4" role="status"><div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /><p className="text-[13px] font-medium">{created.name} added</p></div><p className={`mt-2 text-[12px] ${connectionTest.state === "error" ? "text-destructive" : "text-muted-foreground"}`}>{connectionTest.message}</p><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => setStep(2)}>Continue<ChevronRight data-icon="inline-end" /></Button><Button variant="ghost" size="sm" onClick={() => void finish()}>Finish later</Button></div></div>
            : <ConnectionForm onSaved={onCreated} stayOnSave />}
          {!created && <div className="mt-3 flex justify-between border-t border-border pt-3"><Button variant="ghost" size="sm" onClick={() => setStep(0)}><ChevronLeft data-icon="inline-start" />Back</Button><Button variant="ghost" size="sm" onClick={() => setStep(2)}>Skip this step<ChevronRight data-icon="inline-end" /></Button></div>}
        </section>}
        {step === 2 && <section className="rounded-xl border border-border bg-card p-5 sm:p-7"><div className="mb-5 flex items-start justify-between gap-3"><div><h1 className="text-lg font-semibold">Connect an AI client</h1><p className="mt-1 text-[12px] text-muted-foreground">Add db-mcp to an app you use. You can do this later, too.</p></div><Button variant="ghost" size="sm" onClick={() => setStep(1)}><ChevronLeft data-icon="inline-start" />Back</Button></div><AiClientList compact mcpUrl={serverInfo?.mcpUrl} /><div className="mt-5 flex justify-end"><Button onClick={() => void finish()} disabled={updateSettings.isPending}>{updateSettings.isPending ? "Finishing…" : "Finish"}<Check data-icon="inline-end" /></Button></div></section>}
      </div>
      <p className="mt-5 text-center text-[11px] text-muted-foreground">You can change these settings anytime.</p>
    </div>
    <Dialog open={skipConfirm} onOpenChange={setSkipConfirm}><DialogContent><DialogHeader><DialogTitle>Skip setup for now?</DialogTitle><DialogDescription>You can add databases and connect AI clients from the app whenever you’re ready.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setSkipConfirm(false)}>Keep setting up</Button><Button onClick={skip}>Skip setup</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}
