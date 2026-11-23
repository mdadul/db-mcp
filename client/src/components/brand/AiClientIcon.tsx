import type { AiClientId } from "@/platform/types";

const AI_CLIENT_ICONS: Record<AiClientId, { src: string; label: string; monochrome: boolean }> = {
  "claude-desktop": { src: "/ai-clients/claude.svg", label: "Claude Desktop", monochrome: false },
  "claude-code": { src: "/ai-clients/claude.svg", label: "Claude Code", monochrome: false },
  cursor: { src: "/ai-clients/cursor.svg", label: "Cursor", monochrome: true },
  vscode: { src: "/ai-clients/vscode.svg", label: "VS Code", monochrome: false },
  windsurf: { src: "/ai-clients/windsurf.svg", label: "Windsurf", monochrome: true },
  "lm-studio": { src: "/ai-clients/lmstudio.svg", label: "LM Studio", monochrome: true },
};

export function AiClientIcon({ id, name, className = "size-5" }: { id: string; name: string; className?: string }) {
  const icon = Object.hasOwn(AI_CLIENT_ICONS, id) ? AI_CLIENT_ICONS[id as AiClientId] : undefined;
  if (!icon) {
    const initials = name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
    return <span role="img" aria-label={name} title={name} className={`inline-flex items-center justify-center text-ui-xs font-semibold ${className}`}>{initials}</span>;
  }
  return <img src={icon.src} alt={icon.label} title={icon.label} draggable={false} className={`shrink-0 object-contain ${icon.monochrome ? "dark:invert" : ""} ${className}`} />;
}
