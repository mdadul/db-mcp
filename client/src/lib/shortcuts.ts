export type ShortcutOs = "macos" | "other";

export type ShortcutGroup = "General" | "Navigation" | "Workbench";

export type ShortcutId =
  | "commandPalette"
  | "shortcutSheet"
  | "settings"
  | "toggleNavigation"
  | "gotoConnections"
  | "gotoAiClients"
  | "gotoActivity"
  | "gotoSettings"
  | "newConnection"
  | "newQuery"
  | "closeTab"
  | "findConnections"
  | "runQuery";

export interface ShortcutDefinition {
  id: ShortcutId;
  keys: string;
  label: string;
  group: ShortcutGroup;
  context?: string;
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ["General", "Navigation", "Workbench"];

export const shortcuts: readonly ShortcutDefinition[] = [
  { id: "commandPalette", keys: "Mod+K", label: "Command palette", group: "General" },
  { id: "shortcutSheet", keys: "Mod+/", label: "Keyboard shortcuts", group: "General" },
  { id: "settings", keys: "Mod+,", label: "Open settings", group: "General" },
  {
    id: "toggleNavigation",
    keys: "Mod+\\",
    label: "Show or hide navigation labels",
    group: "Navigation",
  },
  { id: "gotoConnections", keys: "Mod+1", label: "Go to Connections", group: "Navigation" },
  { id: "gotoAiClients", keys: "Mod+2", label: "Go to AI Clients", group: "Navigation" },
  { id: "gotoActivity", keys: "Mod+3", label: "Go to Activity", group: "Navigation" },
  { id: "gotoSettings", keys: "Mod+4", label: "Go to Settings", group: "Navigation" },
  { id: "newConnection", keys: "Mod+N", label: "New connection", group: "Workbench" },
  { id: "newQuery", keys: "Mod+T", label: "New query tab", group: "Workbench" },
  { id: "closeTab", keys: "Mod+W", label: "Close tab", group: "Workbench" },
  { id: "findConnections", keys: "Mod+F", label: "Find a connection", group: "Workbench" },
  { id: "runQuery", keys: "Mod+Enter", label: "Run query", group: "Workbench" },
];

const MODIFIER_LABELS: Record<ShortcutOs, Record<string, string>> = {
  macos: { mod: "⌘", shift: "⇧", alt: "⌥", ctrl: "⌃" },
  other: { mod: "Ctrl", shift: "Shift", alt: "Alt", ctrl: "Ctrl" },
};

const KEY_LABELS: Record<string, string> = { enter: "Enter", escape: "Esc" };

export function getShortcut(id: ShortcutId): ShortcutDefinition {
  const shortcut = shortcuts.find((entry) => entry.id === id);
  if (!shortcut) throw new Error(`Unknown shortcut: ${id}`);
  return shortcut;
}

export function shortcutParts(keys: string, os: ShortcutOs): string[] {
  return keys.split("+").map((part) => {
    const token = part.trim();
    const lower = token.toLowerCase();
    const modifier = MODIFIER_LABELS[os][lower];
    if (modifier) return modifier;
    if (KEY_LABELS[lower]) return KEY_LABELS[lower];
    return token.length === 1 ? token.toUpperCase() : token;
  });
}

export function formatShortcut(keys: string, os: ShortcutOs): string {
  return shortcutParts(keys, os).join(os === "macos" ? "" : "+");
}

export function detectShortcutOs(): ShortcutOs {
  if (typeof navigator === "undefined") return "other";
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent) ? "macos" : "other";
}

export function shortcutOsForPlatform(
  platform: "macos" | "windows" | "linux" | undefined,
): ShortcutOs {
  if (platform === undefined) return detectShortcutOs();
  return platform === "macos" ? "macos" : "other";
}
