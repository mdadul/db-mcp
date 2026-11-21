import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { PageHeader, Section } from "@/components/ui/primitives";
import { useSettings, useUpdateSettings } from "@/platform/hooks";

export function SettingsPage() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [port, setPort] = useState<number>();

  const savePort = async () => {
    const newPort = port ?? settings?.port ?? 4080;
    if (!Number.isInteger(newPort) || newPort < 1 || newPort > 65535) {
      toast.error("Enter a valid port from 1 to 65535");
      return;
    }
    await updateSettings.mutateAsync({ port: newPort });
    setPort(undefined);
    toast.success("Server port updated");
  };

  return <div className="mx-auto w-full max-w-5xl px-6 py-7">
    <PageHeader title="Settings" description="Manage the local server, app preferences, and data." />
    <Section title="Local server" description="The backend listens only on this computer.">
      <div className="flex max-w-lg flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="flex-1 text-xs font-medium">Server port<Input type="number" min={1} max={65535} value={port ?? settings?.port ?? 4080} onChange={(event) => setPort(Number(event.target.value))} className="mt-1.5 font-mono" /></label>
        <Button onClick={() => void savePort()} disabled={updateSettings.isPending}>Save port</Button>
      </div>
    </Section>
    <Section title="Appearance" description="Choose how db-mcp looks on this device.">
      <div className="flex flex-wrap gap-2">{(["system", "light", "dark"] as const).map((theme) => <Button key={theme} variant={settings?.theme === theme ? "default" : "outline"} onClick={() => updateSettings.mutate({ theme })} className="capitalize">{theme}</Button>)}</div>
    </Section>
  </div>;
}
