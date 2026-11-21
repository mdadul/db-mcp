import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Clipboard, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { SettingRow } from "@/components/ui/SettingRow";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SettingsGroup } from "@/components/ui/SettingsGroup";
import { platform } from "@/platform";
import { useSettings, useUpdateSettings } from "@/platform/hooks";
import type { AppSettings } from "@/platform/types";
import { checkThemeContrast, invalidCssColors } from "./contrast";
import { themeSchema, type ThemeDefinition, type ThemeVariant } from "./schema";
import { builtInThemes } from "./themes";

const accents: readonly { value: AppSettings["accent"]; label: string }[] = [
  { value: "blue", label: "Blue" }, { value: "violet", label: "Violet" }, { value: "green", label: "Green" },
  { value: "orange", label: "Orange" }, { value: "pink", label: "Pink" }, { value: "graphite", label: "Graphite" },
];

export function AppearanceSettings() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const customQuery = useQuery({
    queryKey: ["platform", "custom-themes"],
    queryFn: async () => (await platform.listCustomThemes()).flatMap((json) => {
      try { const result = themeSchema.safeParse(JSON.parse(json)); return result.success ? [result.data] : []; }
      catch { return []; }
    }),
  });
  const customThemes = customQuery.data ?? [];
  const themes = useMemo(() => [...builtInThemes, ...customThemes], [customThemes]);
  const currentTheme = themes.some((theme) => theme.id === settings?.themeId) ? settings?.themeId ?? "default" : "default";
  const selectedTheme = themes.find((theme) => theme.id === currentTheme) ?? builtInThemes[0];
  const accentAllowed = selectedTheme.allowsAccent;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [themeJson, setThemeJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parsedTheme = useMemo(() => {
    if (!themeJson.trim()) return undefined;
    try { return themeSchema.safeParse(JSON.parse(themeJson)); }
    catch (parseError) { return { success: false as const, error: { issues: [{ message: parseError instanceof Error ? parseError.message : "Invalid JSON" }] } }; }
  }, [themeJson]);
  const importTheme = parsedTheme?.success ? parsedTheme.data : undefined;
  const duplicateId = importTheme ? themes.some((theme) => theme.id === importTheme.id) : false;
  const contrastWarnings = importTheme ? checkThemeContrast(importTheme).filter((finding) => !finding.passesAA) : [];
  const invalidThemeColors = importTheme ? invalidCssColors(importTheme) : [];

  const update = (patch: Partial<AppSettings>) => updateSettings.mutate(patch, { onError: (updateError) => toast.error(updateError.message || "Could not save setting") });
  const selectTheme = (theme: ThemeDefinition) => {
    update({
      themeId: theme.id,
      ...(theme.variants.light && theme.variants.dark ? {} : { theme: theme.variants.dark ? "dark" : "light" }),
    });
  };
  const copyTheme = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedTheme, null, 2));
      toast.success("Theme JSON copied");
    } catch { toast.error("Could not copy theme JSON"); }
  };
  const submitTheme = async () => {
    if (!importTheme) return;
    setBusy(true);
    try {
      const id = await platform.installCustomTheme(JSON.stringify(importTheme));
      await customQuery.refetch();
      update({ themeId: id, ...(importTheme.variants.light && importTheme.variants.dark ? {} : { theme: importTheme.variants.dark ? "dark" : "light" }) });
      setDialogOpen(false);
      setThemeJson("");
      setError("");
      toast.success(`${importTheme.name} installed`);
    } catch (installError) { setError(installError instanceof Error ? installError.message : "Could not install theme"); }
    finally { setBusy(false); }
  };
  const deleteTheme = async (theme: ThemeDefinition) => {
    try {
      await platform.deleteCustomTheme(theme.id);
      await customQuery.refetch();
      if (currentTheme === theme.id) update({ themeId: "default" });
      toast.success(`${theme.name} deleted`);
    } catch (deleteError) { toast.error(deleteError instanceof Error ? deleteError.message : "Could not delete theme"); }
  };
  const fontSizeValue: "12" | "13" | "14" = settings?.fontSize === 12 ? "12" : settings?.fontSize === 14 ? "14" : "13";
  const previewMode = settings?.theme === "dark" ? "dark" : settings?.theme === "light" ? "light" : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const canChooseMode = Boolean(selectedTheme.variants.light && selectedTheme.variants.dark);

  return <>
    <SettingsGroup className="mb-3">
      <SettingRow title="Mode" description="System follows your computer's appearance setting. Single-mode themes force their supported mode." control={canChooseMode ? <SegmentedControl value={settings?.theme ?? "system"} ariaLabel="Color mode" onChange={(theme) => update({ theme })} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /> : <span className="text-[12px] text-muted-foreground">{selectedTheme.variants.dark ? "Dark only" : "Light only"}</span>} />
      <div className="border-t border-border p-3.5">
        <div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-[13px] font-medium">Theme</p><p className="mt-0.5 text-[12px] text-muted-foreground">Choose a palette for the whole interface.</p></div><Button variant="outline" size="sm" onClick={() => void copyTheme()}><Clipboard data-icon="inline-start" />Copy current theme JSON</Button></div>
        <div role="radiogroup" aria-label="Theme gallery" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" onKeyDown={(event) => {
          if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
          const cards = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")];
          const index = cards.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const next = cards[(index + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : cards.length - 1)) % cards.length];
          next?.focus();
          next?.click();
        }}>
          {themes.map((theme) => {
            const active = theme.id === currentTheme;
            const previewVariant = theme.variants[previewMode] ?? theme.variants.dark ?? theme.variants.light!;
            return <button key={theme.id} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1} onClick={() => selectTheme(theme)} className={`min-w-0 rounded-md border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${active ? "border-primary bg-accent-subtle" : "border-border hover:border-border-strong hover:bg-muted/40"}`}>
              <ThemePreview theme={theme} variant={previewVariant} />
              <span className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-[12px] font-medium">{theme.name}</span>{active && <Check aria-hidden="true" className="size-3.5 shrink-0 text-primary" />}</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">{theme.variants.light && theme.variants.dark ? "Light & dark" : theme.variants.dark ? "Dark only" : "Light only"}</span>
            </button>;
          })}
        </div>
      </div>
      <SettingRow title="Accent color" description={accentAllowed ? "Used for selected items, focus rings, and primary actions." : "This theme defines its own accent color."} disabled={!accentAllowed} control={<div role="group" aria-label="Accent color" className="flex items-center gap-1">{accents.map((accent) => <button key={accent.value} type="button" aria-label={`${accent.label} accent color`} aria-pressed={(settings?.accent ?? "blue") === accent.value} disabled={!accentAllowed || !settings} title={accentAllowed ? accent.label : "This theme does not allow accent overrides"} onClick={() => update({ accent: accent.value })} className={`accent-swatch accent-swatch-${accent.value} flex size-7 items-center justify-center rounded-full border border-transparent text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40`}>{settings?.accent === accent.value ? <Check className="size-3.5" /> : <span className="sr-only">{accent.label}</span>}</button>)}</div>} />
      <SettingRow title="Density" description="Adjust control and table-row spacing." control={<SegmentedControl value={settings?.density ?? "default"} ariaLabel="Interface density" onChange={(density) => update({ density })} options={[{ value: "compact", label: "Compact" }, { value: "default", label: "Default" }, { value: "comfortable", label: "Comfortable" }]} />} />
      <SettingRow title="Interface font size" description="Choose the base text size used across the app." control={<SegmentedControl value={fontSizeValue} ariaLabel="Interface font size" onChange={(fontSize) => update({ fontSize: fontSize === "12" ? 12 : fontSize === "14" ? 14 : 13 })} options={[{ value: "12", label: "12 px" }, { value: "13", label: "13 px" }, { value: "14", label: "14 px" }]} />} />
    </SettingsGroup>
    <SettingsGroup>
      <SettingRow title="Import a custom theme" description="Paste a version 1 theme JSON document. Theme colors are checked for readable text contrast." control={<Button variant="outline" onClick={() => { setError(""); setDialogOpen(true); }}>Import theme…</Button>} />
      {customThemes.length > 0 && <div className="border-t border-border px-3.5 py-3"><p className="mb-2 text-[12px] font-medium">Installed custom themes</p><div className="flex flex-col gap-1.5">{customThemes.map((theme) => <div key={theme.id} className="flex items-center justify-between gap-3 rounded border border-border bg-background px-2.5 py-2"><span className="min-w-0 truncate text-[12px]">{theme.name}<span className="ml-1.5 text-[10px] text-muted-foreground">{theme.id}</span></span><Button variant="ghost" size="icon-xs" aria-label={`Delete ${theme.name}`} onClick={() => void deleteTheme(theme)}><Trash2 /></Button></div>)}</div></div>}
    </SettingsGroup>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-h-[90vh] max-w-[640px] overflow-y-auto"><DialogHeader><DialogTitle>Import a custom theme</DialogTitle><DialogDescription>Paste a theme JSON document. It stays on this device.</DialogDescription></DialogHeader>
      <textarea data-selectable="true" aria-label="Theme JSON" value={themeJson} onChange={(event) => { setThemeJson(event.target.value); setError(""); }} placeholder={'{\n  "id": "my-theme",\n  "name": "My Theme",\n  ...\n}'} className="min-h-48 w-full resize-y rounded-md border border-border-strong bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      {parsedTheme && !parsedTheme.success && <div role="alert" className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-[11px] text-danger">{parsedTheme.error.issues.slice(0, 5).map((issue) => <p key={issue.message}>{issue.message}</p>)}</div>}
      {duplicateId && <p role="alert" className="text-[11px] text-danger">A theme with this id is already installed. Use a unique id.</p>}
      {importTheme && <><ThemePreview theme={importTheme} variant={importTheme.variants[previewMode] ?? importTheme.variants.dark ?? importTheme.variants.light!} />{contrastWarnings.length > 0 ? <div role="status" className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-[11px] text-warning"><p className="font-medium">Some text colors do not meet WCAG AA (4.5:1).</p>{contrastWarnings.slice(0, 6).map((finding) => <p key={`${finding.variant}-${finding.pair}`}>{finding.variant}: {finding.pair} — {finding.ratio?.toFixed(2) ?? "unknown"}:1</p>)}</div> : <p className="text-[11px] text-success">Text contrast passes WCAG AA for the checked background pairs.</p>}</>}
      {error && <p role="alert" className="text-[11px] text-danger">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button disabled={!importTheme || invalidThemeColors.length > 0 || duplicateId || busy} onClick={() => void submitTheme()}><Download data-icon="inline-start" />{busy ? "Installing…" : "Install theme"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}

function ThemePreview({ theme, variant: themeVariant }: { theme: ThemeDefinition; variant: ThemeVariant }) {
  const tokens = themeVariant.tokens;
  const style = Object.fromEntries(Object.entries(tokens).map(([name, value]) => [`--${name}`, value])) as CSSProperties;
  const charts = themeVariant.chart;
  return <div aria-hidden="true" className="flex h-[92px] overflow-hidden rounded border" style={{ ...style, background: "var(--background)", borderColor: "var(--border)" }}>
    <div className="w-1/5 shrink-0 p-1.5" style={{ background: "var(--sidebar)", borderRight: "1px solid var(--border)" }}><div className="mb-2 h-1 w-6 rounded" style={{ background: "var(--text-muted)" }} /><div className="mb-1 h-1 w-full rounded" style={{ background: "var(--accent-subtle)" }} /><div className="h-1 w-4/5 rounded" style={{ background: "var(--border-strong)" }} /></div>
    <div className="min-w-0 flex-1 p-1.5"><div className="mb-1.5 flex h-3 items-center justify-between border-b pb-1" style={{ borderColor: "var(--border)" }}><div className="h-1 w-10 rounded" style={{ background: "var(--text-muted)" }} /><div className="h-3 w-8 rounded-sm" style={{ background: "var(--accent)", color: "var(--accent-foreground)" }} /></div><div className="space-y-1">{[0, 1, 2].map((row) => <div key={row} className="flex h-3 items-center gap-1 rounded px-1" style={{ background: row === 1 ? "var(--accent-subtle)" : "var(--surface)" }}><span className="h-1 w-1/3 rounded" style={{ background: "var(--text-muted)" }} /><span className="h-1 w-1/4 rounded" style={{ background: "var(--border-strong)" }} /><span className="h-1 w-1/5 rounded" style={{ background: "var(--text-subtle)" }} /></div>)}</div><div className="mt-1.5 flex h-4 items-end gap-1">{charts.slice(0, 3).map((color, index) => <span key={color} className="w-2 rounded-t-sm" style={{ height: `${6 + index * 3}px`, background: color }} />)}</div></div>
  </div>;
}
