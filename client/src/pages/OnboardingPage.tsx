import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Database, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { DatabaseForm } from "@/features/databases/components/DatabaseForm";
import { AiClientList } from "@/features/ai-clients/components/AiClientList";
import { useUpdateSettings } from "@/platform/hooks";
import type { DatabaseConnection } from "@/features/databases/types";
import { databaseApi } from "@/features/databases/api/databaseApi";

const steps = ["Welcome", "Add database", "Connect AI client"] as const;

export function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [created, setCreated] = useState<DatabaseConnection | null>(null);
  const [connectionTest, setConnectionTest] = useState("Testing the new connection…");
  const navigate = useNavigate();
  const updateSettings = useUpdateSettings();
  const finish = async () => {
    try {
      await updateSettings.mutateAsync({ onboardingCompleted: true });
      navigate("/connections", { replace: true });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not finish setup");
    }
  };

  return <div className="mx-auto w-full max-w-5xl px-6 py-7">
    <PageHeader title="Welcome to db-mcp" description="Set up your private, local bridge between databases and AI clients." />
    <ol aria-label="Setup progress" className="mb-8 grid grid-cols-3 gap-3">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`flex items-center gap-2 border-b-2 pb-3 text-xs ${step === index ? "border-primary font-semibold text-foreground" : step > index ? "border-primary/40 text-muted-foreground" : "border-border text-muted-foreground"}`}><span className={`flex size-6 items-center justify-center rounded-full text-[11px] ${step > index ? "bg-primary/10 text-primary" : step === index ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{step > index ? <Check className="size-3" /> : index + 1}</span>{label}</li>)}</ol>
    {step === 0 && <section className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-7"><div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-5" /></div><h2 className="text-lg font-semibold tracking-tight">Everything stays on this computer.</h2><p className="mt-2 text-sm text-muted-foreground">db-mcp runs locally, encrypts connection credentials, and only allows read-only database access.</p><div className="mt-6 flex justify-end"><Button onClick={() => setStep(1)}>Set up a connection<ChevronRight data-icon="inline-end" /></Button></div></section>}
    {step === 1 && <section><div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="text-sm font-semibold">Add your first database</h2><p className="mt-1 text-xs text-muted-foreground">Paste a connection string or enter connection details. You can also skip this step.</p></div><div className="flex shrink-0 gap-2"><Button variant="ghost" size="sm" onClick={() => setStep(2)}>Skip</Button>{created && <Button size="sm" onClick={() => setStep(2)}>Continue<ChevronRight data-icon="inline-end" /></Button>}</div></div>{created ? <div className="mb-4 rounded-lg border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm font-medium"><Database className="size-4 text-primary" />{created.name} added</div><p className="mt-2 text-xs text-muted-foreground" role="status">{connectionTest}</p><ReadOnlySnippet connection={created} /></div> : <DatabaseForm onCreated={(connection) => { setCreated(connection); void databaseApi.testConnection(connection.id).then((result) => setConnectionTest(result.success ? `Connection test passed in ${result.latencyMs ?? "—"} ms.` : `Connection test failed: ${result.message}${result.hint ? ` ${result.hint}` : ""}`)).catch((error: unknown) => setConnectionTest(error instanceof Error ? `Connection test failed: ${error.message}` : "Connection test failed.")); }} />}</section>}
    {step === 2 && <section><div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="text-sm font-semibold">Connect an AI client</h2><p className="mt-1 text-xs text-muted-foreground">Choose a local app and add the db-mcp server configuration.</p></div><Button variant="ghost" size="sm" onClick={() => setStep(1)}><ChevronLeft data-icon="inline-start" />Back</Button></div><AiClientList /><div className="mt-6 flex justify-end"><Button onClick={() => void finish()} disabled={updateSettings.isPending}>{updateSettings.isPending ? "Finishing…" : "Finish setup"}<Check data-icon="inline-end" /></Button></div></section>}
  </div>;
}

function ReadOnlySnippet({ connection }: { connection: DatabaseConnection }) {
  let command: string;
  if (connection.type === "postgresql" || connection.type === "redshift") {
    command = `CREATE ROLE db_mcp_readonly WITH LOGIN PASSWORD 'replace-with-a-strong-password';\nGRANT CONNECT ON DATABASE ${connection.databaseName} TO db_mcp_readonly;\nGRANT USAGE ON SCHEMA public TO db_mcp_readonly;\nGRANT SELECT ON ALL TABLES IN SCHEMA public TO db_mcp_readonly;\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO db_mcp_readonly;`;
  } else if (connection.type === "mysql") {
    command = `CREATE USER 'db_mcp_readonly'@'localhost' IDENTIFIED BY 'replace-with-a-strong-password';\nGRANT SELECT, SHOW VIEW ON \`${connection.databaseName}\`.* TO 'db_mcp_readonly'@'localhost';\nFLUSH PRIVILEGES;`;
  } else if (connection.type === "mongodb") {
    command = `db.createRole({ role: "dbMcpReadOnly", privileges: [{ resource: { db: "${connection.databaseName}", collection: "" }, actions: ["find", "listCollections", "listIndexes"] }], roles: [] })`;
  } else {
    command = "Set the database file permissions so the db-mcp process can read it, but only trusted users can write to it.";
  }
  return <div className="mt-4"><p className="mb-2 text-xs font-medium">Recommended read-only access for {connection.type}</p><pre className="max-h-52 overflow-auto rounded-md bg-muted p-3 font-mono text-[10px] leading-5">{command}</pre><p className="mt-2 text-[10px] text-muted-foreground">Review and adapt this example for your database host and authentication policy.</p></div>;
}
