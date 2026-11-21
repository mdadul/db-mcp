import { themeSettingsSchema, type SemanticToken, type ThemeDefinition, type ThemeSettings, type ThemeVariant } from "./schema";
import { builtInThemes, getBuiltInTheme } from "./themes";

const CACHE_KEY = "dbmcp.themeSnapshot";
let registeredCustomThemes: readonly ThemeDefinition[] = [];
const DENSITY_VALUES = {
  compact: { control: 24, small: 20, large: 28, row: 24 },
  default: { control: 28, small: 24, large: 32, row: 28 },
  comfortable: { control: 32, small: 28, large: 36, row: 34 },
} as const;
const ACCENTS: Record<ThemeSettings["accent"], { light: readonly [string, string, string, string]; dark: readonly [string, string, string, string] }> = {
  blue: { light: ["oklch(0.52 0.18 255)", "oklch(0.46 0.18 255)", "oklch(0.94 0.035 255)", "oklch(0.58 0.17 255)"], dark: ["oklch(0.73 0.14 255)", "oklch(0.79 0.13 255)", "oklch(0.3 0.055 255)", "oklch(0.75 0.14 255)"] },
  violet: { light: ["oklch(0.5 0.19 295)", "oklch(0.44 0.19 295)", "oklch(0.94 0.035 295)", "oklch(0.56 0.18 295)"], dark: ["oklch(0.77 0.13 295)", "oklch(0.82 0.11 295)", "oklch(0.32 0.055 295)", "oklch(0.78 0.13 295)"] },
  green: { light: ["oklch(0.48 0.14 155)", "oklch(0.42 0.14 155)", "oklch(0.94 0.035 155)", "oklch(0.54 0.13 155)"], dark: ["oklch(0.76 0.13 155)", "oklch(0.81 0.11 155)", "oklch(0.31 0.05 155)", "oklch(0.77 0.13 155)"] },
  orange: { light: ["oklch(0.56 0.16 55)", "oklch(0.49 0.16 55)", "oklch(0.95 0.035 65)", "oklch(0.59 0.15 55)"], dark: ["oklch(0.78 0.13 55)", "oklch(0.83 0.11 55)", "oklch(0.32 0.05 65)", "oklch(0.79 0.12 55)"] },
  pink: { light: ["oklch(0.53 0.18 350)", "oklch(0.46 0.18 350)", "oklch(0.95 0.035 350)", "oklch(0.58 0.17 350)"], dark: ["oklch(0.77 0.13 350)", "oklch(0.82 0.11 350)", "oklch(0.32 0.055 350)", "oklch(0.78 0.13 350)"] },
  graphite: { light: ["oklch(0.42 0.012 255)", "oklch(0.35 0.012 255)", "oklch(0.93 0.006 255)", "oklch(0.48 0.012 255)"], dark: ["oklch(0.82 0.01 255)", "oklch(0.88 0.008 255)", "oklch(0.32 0.01 255)", "oklch(0.82 0.01 255)"] },
};

export interface ThemeApplication extends ThemeSettings { customThemes?: readonly ThemeDefinition[] }
export interface ThemeSnapshot { themeId: string; mode: "light" | "dark"; modePreference: ThemeSettings["mode"]; accent: ThemeSettings["accent"]; variables: Record<string, string>; systemVariants?: { light: Record<string, string>; dark: Record<string, string> }; density: ThemeSettings["density"]; fontSize: ThemeSettings["fontSize"]; allowsAccent: boolean }

function resolveTheme(themeId: string, customThemes: readonly ThemeDefinition[] = []): ThemeDefinition {
  return getBuiltInTheme(themeId) ?? customThemes.find((theme) => theme.id === themeId) ?? registeredCustomThemes.find((theme) => theme.id === themeId) ?? getBuiltInTheme("default")!;
}

function resolveMode(theme: ThemeDefinition, mode: ThemeSettings["mode"]): "light" | "dark" {
  if (!theme.variants.light) return "dark";
  if (!theme.variants.dark) return "light";
  if (mode === "light" || mode === "dark") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyDefaultTheme(): void {
  applyTheme({ themeId: "default", mode: "system", accent: "blue", density: "default", fontSize: 13 });
}

export function installSystemModeListener(settings: ThemeApplication): () => void {
  const theme = resolveTheme(settings.themeId, settings.customThemes);
  if (settings.mode !== "system" || !theme.variants.light || !theme.variants.dark) return () => undefined;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => applyTheme({ ...settings, mode: "system" });
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

export function resolveThemeSnapshot(settingsInput: ThemeApplication): ThemeSnapshot {
  const settings = themeSettingsSchema.parse(settingsInput);
  const theme = resolveTheme(settings.themeId, settingsInput.customThemes);
  const resolvedSettings = {
    ...settings,
    themeId: theme.id,
    mode: theme.variants.light && theme.variants.dark ? settings.mode : theme.variants.dark ? "dark" as const : "light" as const,
    accent: theme.allowsAccent ? settings.accent : "blue" as const,
  };
  const mode = resolveMode(theme, resolvedSettings.mode);
  const variant = theme.variants[mode] ?? theme.variants.dark ?? theme.variants.light!;
  const variables: Record<string, string> = Object.fromEntries(Object.entries(variant.tokens).map(([name, value]) => [`--${name}`, value]));
  const active = ACCENTS[resolvedSettings.accent][mode];
  if (theme.allowsAccent) {
    [variables["--accent"], variables["--accent-hover"], variables["--accent-subtle"], variables["--focus-ring"]] = active;
  }
  variables["--background-compat"] = "var(--background)";
  variables["--foreground"] = "var(--text)";
  variables["--card"] = "var(--surface)";
  variables["--card-foreground"] = "var(--text)";
  variables["--popover"] = "var(--surface-raised)";
  variables["--popover-foreground"] = "var(--text)";
  variables["--primary"] = "var(--accent)";
  variables["--primary-foreground"] = "var(--accent-foreground)";
  variables["--secondary"] = mode === "dark" ? "color-mix(in oklab, var(--surface) 70%, var(--text) 10%)" : "color-mix(in oklab, var(--surface) 95%, var(--text) 5%)";
  variables["--secondary-foreground"] = "var(--text)";
  variables["--muted"] = variables["--secondary"];
  variables["--muted-foreground"] = "var(--text-muted)";
  variables["--input"] = "var(--border-strong)";
  variables["--ring"] = "var(--focus-ring)";
  variables["--destructive"] = "var(--danger)";
  variables["--destructive-foreground"] = mode === "dark" ? "#1a1111" : "#ffffff";
  variables["--sidebar-foreground"] = "var(--text)";
  variables["--sidebar-border"] = "var(--border)";
  variables["--sidebar-accent"] = "var(--accent-subtle)";
  variables["--sidebar-accent-foreground"] = "var(--text)";
  variables["--sidebar-primary"] = "var(--accent)";
  variables["--sidebar-primary-foreground"] = "var(--accent-foreground)";
  variables["--sidebar-ring"] = "var(--focus-ring)";
  variant.chart.forEach((value, index) => { variables[`--chart-${index + 1}`] = value; });
  for (const [name, value] of Object.entries(variant.syntax)) variables[`--syntax-${name}`] = value;
  const density = DENSITY_VALUES[resolvedSettings.density];
  variables["--control-h"] = `${density.control}px`;
  variables["--control-h-sm"] = `${density.small}px`;
  variables["--control-h-lg"] = `${density.large}px`;
  variables["--row-h"] = `${density.row}px`;
  variables["--font-size-base"] = `${resolvedSettings.fontSize}px`;
  return { themeId: theme.id, mode, modePreference: settings.mode, accent: resolvedSettings.accent, variables, density: resolvedSettings.density, fontSize: resolvedSettings.fontSize, allowsAccent: theme.allowsAccent };
}

export function applyTheme(settings: ThemeApplication): ThemeSnapshot {
  const snapshot = resolveThemeSnapshot(settings);
  const root = document.documentElement;
  root.dataset.theme = `${snapshot.themeId}-${snapshot.mode}`;
  root.dataset.mode = snapshot.mode;
  root.dataset.density = snapshot.density;
  root.dataset.fontSize = String(snapshot.fontSize);
  if (snapshot.allowsAccent) root.dataset.accent = snapshot.accent;
  else delete root.dataset.accent;
  root.classList.toggle("dark", snapshot.mode === "dark");
  root.style.colorScheme = snapshot.mode;
  let style = document.getElementById("app-theme");
  if (!style) {
    style = document.createElement("style");
    style.id = "app-theme";
    document.head.append(style);
  }
  style.textContent = `:root{color-scheme:${snapshot.mode};${Object.entries(snapshot.variables).map(([key, value]) => `${key}:${value}`).join(";")}}`;
  const cachedSnapshot = settings.mode === "system" && settings.themeId !== "dracula"
    ? { ...snapshot, systemVariants: { light: resolveThemeSnapshot({ ...settings, mode: "light" }).variables, dark: resolveThemeSnapshot({ ...settings, mode: "dark" }).variables } }
    : snapshot;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cachedSnapshot)); } catch { /* Storage may be disabled in private contexts. */ }
  return snapshot;
}

export function applyCachedThemeSnapshot(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      const oldSettings: unknown = JSON.parse(localStorage.getItem("dbmcp.settingsCache") ?? "null");
      const cachedSettings = typeof oldSettings === "object" && oldSettings !== null ? oldSettings as Record<string, unknown> : {};
      const legacySettings = themeSettingsSchema.parse({
        themeId: cachedSettings.themeId,
        mode: cachedSettings.theme,
        accent: cachedSettings.accent,
        density: cachedSettings.density,
        fontSize: cachedSettings.fontSize,
      });
      applyTheme(legacySettings);
      return;
    }
    const snapshot: unknown = JSON.parse(raw);
    if (!isThemeSnapshot(snapshot)) {
      localStorage.removeItem(CACHE_KEY);
      applyDefaultTheme();
      return;
    }
    setSnapshot(snapshot);
  } catch {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* Storage may be disabled. */ }
    applyDefaultTheme();
  }
}

function isThemeSnapshot(value: unknown): value is ThemeSnapshot {
  if (typeof value !== "object" || value === null || !("variables" in value) || typeof value.variables !== "object" || value.variables === null) return false;
  if (!("themeId" in value) || typeof value.themeId !== "string" || !("mode" in value) || (value.mode !== "light" && value.mode !== "dark")) return false;
  if (!("accent" in value) || typeof value.accent !== "string" || !(value.accent in ACCENTS)) return false;
  if (!("density" in value) || typeof value.density !== "string" || !(value.density in DENSITY_VALUES)) return false;
  if (!("fontSize" in value) || typeof value.fontSize !== "number" || ![12, 13, 14].includes(value.fontSize)) return false;
  if (!("allowsAccent" in value) || typeof value.allowsAccent !== "boolean") return false;
  if (!("modePreference" in value) || (value.modePreference !== "system" && value.modePreference !== "light" && value.modePreference !== "dark")) return false;
  if (value.modePreference === "system" && (!("systemVariants" in value) || typeof value.systemVariants !== "object" || value.systemVariants === null || !("light" in value.systemVariants) || !("dark" in value.systemVariants) || !isVariableMap(value.systemVariants.light) || !isVariableMap(value.systemVariants.dark))) return false;
  return isVariableMap(value.variables);
}

function isVariableMap(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) return false;
  if (!("--background" in value) || !("--text" in value)) return false;
  return Object.entries(value).every(([name, color]) => {
    if (!/^--[a-z\d-]+$/.test(name) || typeof color !== "string" || color.length > 160 || /[;{}<>]/.test(color)) return false;
    return /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([^;{}]+\)|transparent|currentColor)$/i.test(color)
      || /^var\(--[a-z\d-]+\)$/.test(color)
      || /^color-mix\(in oklab, var\(--[a-z\d-]+\) \d+%, var\(--[a-z\d-]+\) \d+%\)$/.test(color)
      || /^\d+px$/.test(color);
  });
}

function setSnapshot(snapshot: ThemeSnapshot): void {
  const mode = snapshot.modePreference === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : snapshot.modePreference;
  const variables = snapshot.modePreference === "system" ? snapshot.systemVariants?.[mode] ?? snapshot.variables : snapshot.variables;
  const root = document.documentElement;
  root.dataset.theme = `${snapshot.themeId}-${mode}`;
  root.dataset.mode = mode;
  root.dataset.density = snapshot.density;
  root.dataset.fontSize = String(snapshot.fontSize);
  if (snapshot.allowsAccent) root.dataset.accent = snapshot.accent;
  else delete root.dataset.accent;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
  let style = document.getElementById("app-theme");
  if (!style) { style = document.createElement("style"); style.id = "app-theme"; document.head.append(style); }
  const safeVariables = Object.entries(variables).filter(([key, value]) => /^--[a-z\d-]+$/.test(key) && typeof value === "string" && value.length <= 160 && !/[;{}<>]/.test(value));
  style.textContent = `:root{color-scheme:${mode};${safeVariables.map(([key, value]) => `${key}:${value}`).join(";")}}`;
}

export function installThemeApplication(settings: ThemeApplication): () => void {
  applyTheme(settings);
  return installSystemModeListener(settings);
}

export function registerCustomThemes(themes: readonly ThemeDefinition[]): void {
  registeredCustomThemes = themes;
}

export function getThemeSnapshot(settings: ThemeSettings): ThemeSnapshot {
  return resolveThemeSnapshot(settings);
}

export const themeVariableNames: readonly `--${SemanticToken}`[] = [
  "--background", "--surface", "--surface-raised", "--sidebar", "--border", "--border-strong", "--text", "--text-muted", "--text-subtle", "--accent", "--accent-hover", "--accent-subtle", "--accent-foreground", "--success", "--success-subtle", "--warning", "--warning-subtle", "--danger", "--danger-subtle", "--info", "--info-subtle", "--focus-ring",
];

export { builtInThemes, getBuiltInTheme };
