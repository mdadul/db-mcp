import { useNavigate } from "react-router-dom";
import { Database, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/primitives";
import { useUpdateSettings } from "@/platform/hooks";

export function OnboardingPage() {
  const navigate = useNavigate();
  const updateSettings = useUpdateSettings();
  const getStarted = async () => {
    await updateSettings.mutateAsync({ onboardingCompleted: true });
    navigate("/connections", { replace: true });
  };

  return <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-12"><PageHeader title="Welcome to db-mcp" description="A private, local bridge between your databases and AI tools." /><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border bg-card p-5"><Database className="mb-4 size-5 text-primary" /><h2 className="text-sm font-semibold">Your data stays local</h2><p className="mt-1 text-sm text-muted-foreground">The server runs on this computer and connects to the databases you choose.</p></div><div className="rounded-xl border border-border bg-card p-5"><ShieldCheck className="mb-4 size-5 text-primary" /><h2 className="text-sm font-semibold">Read-only by default</h2><p className="mt-1 text-sm text-muted-foreground">AI tools can inspect schemas and run safe, read-only queries.</p></div></div><div className="mt-6"><Button onClick={() => void getStarted()} disabled={updateSettings.isPending}>Get started</Button></div></div>;
}
