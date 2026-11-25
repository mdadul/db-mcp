import { platform } from "@/platform";
import { INTERFACE_FONT_SIZES } from "@/platform/types";

import { pickAccentForeground } from "./contrast";
import {
  themeSettingsSchema,
  type SemanticToken,
  type ThemeDefinition,
  type ThemeSettings,
} from "./schema";
import { builtInThemes, getBuiltInTheme } from "./themes";

const CACHE_KEY = "dbmcp.themeSnapshot";
let registeredCustomThemes: readonly ThemeDefinition[] = [];
const DENSITY_VALUES = {
  compact: { control: 24, small: 20, large: 28, row: 24 },
  default: { control: 28, small: 24, large: 32, row: 28 },
  comfortable: { control: 32, small: 28, large: 36, row: 34 },
} as const;
const ACCENTS: Record<
  ThemeSettings["accent"],
  {
    light: readonly [string, string, string, string];
    dark: readonly [string, string, string, string];
  }
> = {
  blue: {
    light: [
      "oklch(0.52 0.18 255)",
      "oklch(0.46 0.18 255)",
      "oklch(0.94 0.035 255)",
      "oklch(0.58 0.17 255)",
    ],
    dark: [
      "oklch(0.73 0.14 255)",
      "oklch(0.79 0.13 255)",
      "oklch(0.3 0.055 255)",
      "oklch(0.75 0.14 255)",
    ],
  },
  violet: {
    light: [
      "oklch(0.5 0.19 295)",
      "oklch(0.44 0.19 295)",
      "oklch(0.94 0.035 295)",
      "oklch(0.56 0.18 295)",
    ],
    dark: [
      "oklch(0.77 0.13 295)",
      "oklch(0.82 0.11 295)",
      "oklch(0.32 0.055 295)",
      "oklch(0.78 0.13 295)",
    ],
  },
  green: {
    light: [
      "oklch(0.48 0.14 155)",
      "oklch(0.42 0.14 155)",
      "oklch(0.94 0.035 155)",
      "oklch(0.54 0.13 155)",
    ],
    dark: [
      "oklch(0.76 0.13 155)",
      "oklch(0.81 0.11 155)",
      "oklch(0.31 0.05 155)",
      "oklch(0.77 0.13 155)",
    ],
  },
  orange: {
    light: [
      "oklch(0.56 0.16 55)",
      "oklch(0.49 0.16 55)",
      "oklch(0.95 0.035 65)",
      "oklch(0.59 0.15 55)",
    ],
    dark: [
      "oklch(0.78 0.13 55)",
      "oklch(0.83 0.11 55)",
      "oklch(0.32 0.05 65)",
      "oklch(0.79 0.12 55)",
    ],
  },
  pink: {
    light: [
      "oklch(0.53 0.18 350)",
      "oklch(0.46 0.18 350)",
      "oklch(0.95 0.035 350)",
      "oklch(0.58 0.17 350)",
    ],
    dark: [
      "oklch(0.77 0.13 350)",
      "oklch(0.82 0.11 350)",
      "oklch(0.32 0.055 350)",
      "oklch(0.78 0.13 350)",
    ],
  },
  graphite: {
    light: [
      "oklch(0.42 0.012 255)",
      "oklch(0.35 0.012 255)",
      "oklch(0.93 0.006 255)",
      "oklch(0.48 0.012 255)",
    ],
    dark: [
      "oklch(0.82 0.01 255)",
      "oklch(0.88 0.008 255)",
      "oklch(0.32 0.01 255)",
      "oklch(0.82 0.01 255)",
    ],
  },
};

export interface ThemeApplication extends ThemeSettings {
  customThemes?: readonly ThemeDefinition[];
}
export interface ThemeSnapshot {
  themeId: string;
  mode: "light" | "dark";
  modePreference: ThemeSettings["mode"];
  accent: ThemeSettings["accent"];
  variables: Record<string, string>;
  systemVariants?: { light: Record<string, string>; dark: Record<string, string> };
  density: ThemeSettings["density"];
  fontSize: ThemeSettings["fontSize"];
  uiFont: ThemeSettings["uiFont"];
  uiFontCustom: string;
  codeFont: ThemeSettings["codeFont"];
  codeFontCustom: string;
  codeFontSize: number;
  codeLigatures: boolean;
  allowsAccent: boolean;
}

const UI_FONT_STACKS: Record<ThemeSettings["uiFont"], string> = {
  system:
    '-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, Ubuntu, sans-serif',
  inter: '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  "ibm-plex-sans": '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, sans-serif',
  "source-sans-3": '"Source Sans 3 Variable", "Source Sans 3", sans-serif',
  "atkinson-hyperlegible":
    '"Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible Next", sans-serif',
  custom:
    '"System UI", -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, Ubuntu, sans-serif',
};
const CODE_FONT_STACKS: Record<ThemeSettings["codeFont"], string> = {
  "system-mono": 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
  "jetbrains-mono": '"JetBrains Mono Variable", "JetBrains Mono", monospace',
  "fira-code": '"Fira Code Variable", "Fira Code", monospace',
  "ibm-plex-mono": '"IBM Plex Mono", monospace',
  "source-code-pro": '"Source Code Pro Variable", "Source Code Pro", monospace',
  custom: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
};
const loadUiFont = (font: ThemeSettings["uiFont"]): Promise<unknown> => {
  switch (font) {
    case "inter":
      return import("@fontsource-variable/inter/wght.css");
    case "ibm-plex-sans":
      return import("@fontsource/ibm-plex-sans/400.css");
    case "source-sans-3":
      return import("@fontsource-variable/source-sans-3/wght.css");
    case "atkinson-hyperlegible":
      return import("@fontsource-variable/atkinson-hyperlegible-next/wght.css");
    default:
      return Promise.resolve();
  }
};
const loadCodeFont = (font: ThemeSettings["codeFont"]): Promise<unknown> => {
  switch (font) {
    case "jetbrains-mono":
      return import("@fontsource-variable/jetbrains-mono/wght.css");
    case "fira-code":
      return import("@fontsource-variable/fira-code/wght.css");
    case "ibm-plex-mono":
      return import("@fontsource/ibm-plex-mono/400.css");
    case "source-code-pro":
      return import("@fontsource-variable/source-code-pro/wght.css");
    default:
      return Promise.resolve();
  }
};

export function preloadFontPickerPreviews(): void {
  void Promise.all([
    loadUiFont("inter"),
    loadUiFont("ibm-plex-sans"),
    loadUiFont("source-sans-3"),
    loadUiFont("atkinson-hyperlegible"),
    loadCodeFont("jetbrains-mono"),
    loadCodeFont("fira-code"),
    loadCodeFont("ibm-plex-mono"),
    loadCodeFont("source-code-pro"),
  ]).catch(() => undefined);
}

export function installFontSizeShortcuts(): () => void {
  const updatedListener = (event: Event) => {
    const settings = (event as CustomEvent<unknown>).detail;
    if (typeof settings !== "object" || settings === null) return;
    const parsed = themeSettingsSchema.safeParse({
      themeId: "themeId" in settings ? settings.themeId : undefined,
      mode: "theme" in settings ? settings.theme : undefined,
      accent: "accent" in settings ? settings.accent : undefined,
      density: "density" in settings ? settings.density : undefined,
      fontSize: "fontSize" in settings ? settings.fontSize : undefined,
      uiFont: "uiFont" in settings ? settings.uiFont : undefined,
      uiFontCustom: "uiFontCustom" in settings ? settings.uiFontCustom : undefined,
      codeFont: "codeFont" in settings ? settings.codeFont : undefined,
      codeFontCustom: "codeFontCustom" in settings ? settings.codeFontCustom : undefined,
      codeFontSize: "codeFontSize" in settings ? settings.codeFontSize : undefined,
      codeLigatures: "codeLigatures" in settings ? settings.codeLigatures : undefined,
    });
    if (parsed.success) applyTheme(parsed.data);
  };
  const listener = (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key === "=" && event.shiftKey ? "+" : event.key;
    if (event.shiftKey && key !== "+") return;
    if (!(key === "+" || key === "=" || key === "-" || key === "0")) return;
    event.preventDefault();
    void platform
      .getSettings()
      .then(async (settings) => {
        const desiredSize =
          key === "0" ? 14 : Math.min(18, Math.max(12, settings.fontSize + (key === "-" ? -1 : 1)));
        const fontSize =
          INTERFACE_FONT_SIZES.find((size) => size === desiredSize) ?? settings.fontSize;
        if (fontSize === settings.fontSize) return;
        const updated = await platform.updateSettings({ fontSize });
        applyTheme({ ...updated, mode: updated.theme });
      })
      .catch(() => undefined);
  };
  window.addEventListener("keydown", listener);
  window.addEventListener("dbmcp:settings-updated", updatedListener);
  return () => {
    window.removeEventListener("keydown", listener);
    window.removeEventListener("dbmcp:settings-updated", updatedListener);
  };
}

function resolveTheme(
  themeId: string,
  customThemes: readonly ThemeDefinition[] = [],
): ThemeDefinition {
  return (
    getBuiltInTheme(themeId) ??
    customThemes.find((theme) => theme.id === themeId) ??
    registeredCustomThemes.find((theme) => theme.id === themeId) ??
    getBuiltInTheme("default")!
  );
}

function resolveMode(theme: ThemeDefinition, mode: ThemeSettings["mode"]): "light" | "dark" {
  if (!theme.variants.light) return "dark";
  if (!theme.variants.dark) return "light";
  if (mode === "light" || mode === "dark") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyDefaultTheme(): void {
  applyTheme({
    themeId: "default",
    mode: "system",
    accent: "blue",
    density: "default",
    fontSize: 14,
    uiFont: "system",
    uiFontCustom: "",
    codeFont: "system-mono",
    codeFontCustom: "",
    codeFontSize: 13,
    codeLigatures: false,
  });
}

export function installSystemModeListener(settings: ThemeApplication): () => void {
  const theme = resolveTheme(settings.themeId, settings.customThemes);
  if (settings.mode !== "system" || !theme.variants.light || !theme.variants.dark)
    return () => undefined;
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
    mode:
      theme.variants.light && theme.variants.dark
        ? settings.mode
        : theme.variants.dark
          ? ("dark" as const)
          : ("light" as const),
    accent: theme.allowsAccent ? settings.accent : ("blue" as const),
  };
  const mode = resolveMode(theme, resolvedSettings.mode);
  const variant = theme.variants[mode] ?? theme.variants.dark ?? theme.variants.light!;
  const variables: Record<string, string> = Object.fromEntries(
    Object.entries(variant.tokens).map(([name, value]) => [`--${name}`, value]),
  );
  const active = ACCENTS[resolvedSettings.accent][mode];
  if (theme.allowsAccent) {
    [
      variables["--accent"],
      variables["--accent-hover"],
      variables["--accent-subtle"],
      variables["--focus-ring"],
    ] = active;
    variables["--accent-foreground"] = pickAccentForeground(active[0], active[1]);
  }
  variables["--background-compat"] = "var(--background)";
  variables["--foreground"] = "var(--text)";
  variables["--card"] = "var(--surface)";
  variables["--card-foreground"] = "var(--text)";
  variables["--popover"] = "var(--surface-raised)";
  variables["--popover-foreground"] = "var(--text)";
  variables["--primary"] = "var(--accent)";
  variables["--primary-foreground"] = "var(--accent-foreground)";
  variables["--secondary"] =
    mode === "dark"
      ? "color-mix(in oklab, var(--surface) 70%, var(--text) 10%)"
      : "color-mix(in oklab, var(--surface) 95%, var(--text) 5%)";
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
  variant.chart.forEach((value, index) => {
    variables[`--chart-${index + 1}`] = value;
  });
  for (const [name, value] of Object.entries(variant.syntax)) variables[`--syntax-${name}`] = value;
  const density = DENSITY_VALUES[resolvedSettings.density];
  variables["--control-h"] =
    `${Math.max(density.control, Math.round(resolvedSettings.fontSize * 2.2))}px`;
  variables["--control-h-sm"] =
    `${Math.max(density.small, Math.round(resolvedSettings.fontSize * 1.8))}px`;
  variables["--control-h-lg"] =
    `${Math.max(density.large, Math.round(resolvedSettings.fontSize * 2.5))}px`;
  variables["--row-h"] = `${Math.max(density.row, Math.round(resolvedSettings.fontSize * 2))}px`;
  variables["--font-size-base"] = `${resolvedSettings.fontSize}px`;
  variables["--font-size-caption"] = `${resolvedSettings.fontSize - 2}px`;
  variables["--font-size-secondary"] = `${resolvedSettings.fontSize - 1}px`;
  variables["--font-size-title"] = `${resolvedSettings.fontSize + 3}px`;
  variables["--font-size-heading"] = `${resolvedSettings.fontSize + 8}px`;
  variables["--font-ui"] = fontStack(
    resolvedSettings.uiFont,
    settings.uiFontCustom,
    UI_FONT_STACKS,
  );
  variables["--font-code"] = fontStack(
    resolvedSettings.codeFont,
    settings.codeFontCustom,
    CODE_FONT_STACKS,
  );
  variables["--font-size-code"] = `${settings.codeFontSize}px`;
  variables["--font-feature-settings"] =
    settings.codeLigatures && resolvedSettings.codeFont !== "system-mono"
      ? '"liga" 1, "calt" 1'
      : '"liga" 0, "calt" 0';
  return {
    themeId: theme.id,
    mode,
    modePreference: settings.mode,
    accent: resolvedSettings.accent,
    variables,
    density: resolvedSettings.density,
    fontSize: resolvedSettings.fontSize,
    uiFont: settings.uiFont,
    uiFontCustom: settings.uiFontCustom,
    codeFont: settings.codeFont,
    codeFontCustom: settings.codeFontCustom,
    codeFontSize: settings.codeFontSize,
    codeLigatures: settings.codeLigatures,
    allowsAccent: theme.allowsAccent,
  };
}

function fontStack<T extends string>(
  selected: T,
  customName: string,
  stacks: Record<T, string>,
): string {
  if (selected !== "custom" || !customName) return stacks[selected];
  const fallback = selected === "custom" ? stacks[selected] : "sans-serif";
  return `"${customName}", ${fallback}`;
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
  style.textContent = `:root{color-scheme:${snapshot.mode};${Object.entries(snapshot.variables)
    .map(([key, value]) => `${key}:${value}`)
    .join(";")}}`;
  void loadUiFont(snapshot.uiFont).catch(() => undefined);
  void loadCodeFont(snapshot.codeFont).catch(() => undefined);
  const cachedSnapshot =
    settings.mode === "system" && settings.themeId !== "dracula"
      ? {
          ...snapshot,
          systemVariants: {
            light: resolveThemeSnapshot({ ...settings, mode: "light" }).variables,
            dark: resolveThemeSnapshot({ ...settings, mode: "dark" }).variables,
          },
        }
      : snapshot;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cachedSnapshot));
  } catch {
    /* Storage may be disabled in private contexts. */
  }
  return snapshot;
}

export function applyCachedThemeSnapshot(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      const oldSettings: unknown = JSON.parse(
        localStorage.getItem("dbmcp.settingsCache") ?? "null",
      );
      const cachedSettings =
        typeof oldSettings === "object" && oldSettings !== null
          ? (oldSettings as Record<string, unknown>)
          : {};
      const oldFontSize = cachedSettings.fontSize;
      const legacySettings = themeSettingsSchema.parse({
        themeId: cachedSettings.themeId,
        mode: cachedSettings.theme,
        accent: cachedSettings.accent,
        density: cachedSettings.density,
        fontSize:
          cachedSettings.uiFont === undefined && typeof oldFontSize === "number"
            ? oldFontSize === 12
              ? 13
              : oldFontSize === 13
                ? 14
                : oldFontSize === 14
                  ? 15
                  : oldFontSize
            : oldFontSize,
        uiFont: cachedSettings.uiFont,
        uiFontCustom: cachedSettings.uiFontCustom,
        codeFont: cachedSettings.codeFont,
        codeFontCustom: cachedSettings.codeFontCustom,
        codeFontSize: cachedSettings.codeFontSize,
        codeLigatures: cachedSettings.codeLigatures,
      });
      applyTheme(legacySettings);
      return;
    }
    const snapshot: unknown = JSON.parse(raw);
    if (!isThemeSnapshot(snapshot)) {
      const migrated = migrateLegacySnapshot(snapshot);
      if (!migrated) {
        localStorage.removeItem(CACHE_KEY);
        applyDefaultTheme();
        return;
      }
      setSnapshot(migrated);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(migrated));
      } catch {
        /* Storage may be disabled in private contexts. */
      }
      return;
    }
    setSnapshot(snapshot);
  } catch {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* Storage may be disabled. */
    }
    applyDefaultTheme();
  }
}

function migrateLegacySnapshot(value: unknown): ThemeSnapshot | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("variables" in value) ||
    !isVariableMap(value.variables) ||
    !("themeId" in value) ||
    typeof value.themeId !== "string" ||
    !("mode" in value) ||
    (value.mode !== "light" && value.mode !== "dark") ||
    !("modePreference" in value) ||
    (value.modePreference !== "system" &&
      value.modePreference !== "light" &&
      value.modePreference !== "dark") ||
    !("accent" in value) ||
    typeof value.accent !== "string" ||
    !(value.accent in ACCENTS) ||
    !("density" in value) ||
    typeof value.density !== "string" ||
    !(value.density in DENSITY_VALUES) ||
    !("allowsAccent" in value) ||
    typeof value.allowsAccent !== "boolean"
  )
    return null;
  const previousSize =
    "fontSize" in value && typeof value.fontSize === "number" ? value.fontSize : 13;
  const fontAlreadyMigrated = "uiFont" in value && value.uiFont !== undefined;
  const migratedSize = !fontAlreadyMigrated
    ? previousSize === 12
      ? 13
      : previousSize === 13
        ? 14
        : previousSize === 14
          ? 15
          : previousSize
    : previousSize;
  const fontSize = INTERFACE_FONT_SIZES.find((size) => size === migratedSize);
  if (fontSize === undefined) return null;
  const density = value.density as ThemeSettings["density"];
  const variables = scaleLegacyVariables(value.variables, fontSize, density);
  let systemVariants: ThemeSnapshot["systemVariants"];
  if (
    "systemVariants" in value &&
    typeof value.systemVariants === "object" &&
    value.systemVariants !== null &&
    "light" in value.systemVariants &&
    isVariableMap(value.systemVariants.light) &&
    "dark" in value.systemVariants &&
    isVariableMap(value.systemVariants.dark)
  ) {
    systemVariants = {
      light: scaleLegacyVariables(value.systemVariants.light, fontSize, density),
      dark: scaleLegacyVariables(value.systemVariants.dark, fontSize, density),
    };
  }
  return {
    themeId: value.themeId,
    mode: value.mode,
    modePreference: value.modePreference,
    accent: value.accent as ThemeSettings["accent"],
    variables,
    ...(systemVariants ? { systemVariants } : {}),
    density,
    fontSize,
    uiFont: "system",
    uiFontCustom: "",
    codeFont: "system-mono",
    codeFontCustom: "",
    codeFontSize: 13,
    codeLigatures: false,
    allowsAccent: value.allowsAccent,
  };
}

function scaleLegacyVariables(
  variables: Record<string, string>,
  fontSize: number,
  density: ThemeSettings["density"],
): Record<string, string> {
  const densityValues = DENSITY_VALUES[density];
  return {
    ...variables,
    "--control-h": `${Math.max(densityValues.control, Math.round(fontSize * 2.2))}px`,
    "--control-h-sm": `${Math.max(densityValues.small, Math.round(fontSize * 1.8))}px`,
    "--control-h-lg": `${Math.max(densityValues.large, Math.round(fontSize * 2.5))}px`,
    "--row-h": `${Math.max(densityValues.row, Math.round(fontSize * 2))}px`,
    "--font-size-base": `${fontSize}px`,
    "--font-size-caption": `${fontSize - 2}px`,
    "--font-size-secondary": `${fontSize - 1}px`,
    "--font-size-title": `${fontSize + 3}px`,
    "--font-size-heading": `${fontSize + 8}px`,
    "--font-ui": UI_FONT_STACKS.system,
    "--font-code": CODE_FONT_STACKS["system-mono"],
    "--font-size-code": "13px",
    "--font-feature-settings": '"liga" 0, "calt" 0',
  };
}

function isThemeSnapshot(value: unknown): value is ThemeSnapshot {
  if (
    typeof value !== "object" ||
    value === null ||
    !("variables" in value) ||
    typeof value.variables !== "object" ||
    value.variables === null
  )
    return false;
  if (
    !("themeId" in value) ||
    typeof value.themeId !== "string" ||
    !("mode" in value) ||
    (value.mode !== "light" && value.mode !== "dark")
  )
    return false;
  if (!("accent" in value) || typeof value.accent !== "string" || !(value.accent in ACCENTS))
    return false;
  if (
    !("density" in value) ||
    typeof value.density !== "string" ||
    !(value.density in DENSITY_VALUES)
  )
    return false;
  if (
    !("fontSize" in value) ||
    typeof value.fontSize !== "number" ||
    value.fontSize < 12 ||
    value.fontSize > 18
  )
    return false;
  if (!("uiFont" in value) || typeof value.uiFont !== "string" || !(value.uiFont in UI_FONT_STACKS))
    return false;
  if (
    !("codeFont" in value) ||
    typeof value.codeFont !== "string" ||
    !(value.codeFont in CODE_FONT_STACKS)
  )
    return false;
  if (
    !("uiFontCustom" in value) ||
    typeof value.uiFontCustom !== "string" ||
    !/^[A-Za-z0-9 _-]{0,64}$/.test(value.uiFontCustom)
  )
    return false;
  if (
    !("codeFontCustom" in value) ||
    typeof value.codeFontCustom !== "string" ||
    !/^[A-Za-z0-9 _-]{0,64}$/.test(value.codeFontCustom)
  )
    return false;
  if (
    !("codeFontSize" in value) ||
    typeof value.codeFontSize !== "number" ||
    value.codeFontSize < 11 ||
    value.codeFontSize > 20
  )
    return false;
  if (!("codeLigatures" in value) || typeof value.codeLigatures !== "boolean") return false;
  if (!("allowsAccent" in value) || typeof value.allowsAccent !== "boolean") return false;
  if (
    !("modePreference" in value) ||
    (value.modePreference !== "system" &&
      value.modePreference !== "light" &&
      value.modePreference !== "dark")
  )
    return false;
  if (
    value.modePreference === "system" &&
    (!("systemVariants" in value) ||
      typeof value.systemVariants !== "object" ||
      value.systemVariants === null ||
      !("light" in value.systemVariants) ||
      !("dark" in value.systemVariants) ||
      !isVariableMap(value.systemVariants.light) ||
      !isVariableMap(value.systemVariants.dark))
  )
    return false;
  return isVariableMap(value.variables);
}

function isVariableMap(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) return false;
  if (!("--background" in value) || !("--text" in value)) return false;
  return Object.entries(value).every(([name, color]) => {
    if (
      !/^--[a-z\d-]+$/.test(name) ||
      typeof color !== "string" ||
      color.length > 160 ||
      /[;{}<>]/.test(color)
    )
      return false;
    return (
      /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([^;{}]+\)|transparent|currentColor)$/i.test(
        color,
      ) ||
      /^var\(--[a-z\d-]+\)$/.test(color) ||
      /^color-mix\(in oklab, var\(--[a-z\d-]+\) \d+%, var\(--[a-z\d-]+\) \d+%\)$/.test(color) ||
      /^\d+px$/.test(color) ||
      /^"?(?:[A-Za-z0-9 _-]+)"?(?:,\s*"?(?:[A-Za-z0-9 _-]+)"?)*$/.test(color) ||
      /^"(?:liga|calt)" [01](?:, "(?:liga|calt)" [01])?$/.test(color)
    );
  });
}

function setSnapshot(snapshot: ThemeSnapshot): void {
  const mode =
    snapshot.modePreference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : snapshot.modePreference;
  const variables =
    snapshot.modePreference === "system"
      ? (snapshot.systemVariants?.[mode] ?? snapshot.variables)
      : snapshot.variables;
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
  if (!style) {
    style = document.createElement("style");
    style.id = "app-theme";
    document.head.append(style);
  }
  const safeVariables = Object.entries(variables).filter(
    ([key, value]) =>
      /^--[a-z\d-]+$/.test(key) &&
      typeof value === "string" &&
      value.length <= 160 &&
      !/[;{}<>]/.test(value),
  );
  style.textContent = `:root{color-scheme:${mode};${safeVariables.map(([key, value]) => `${key}:${value}`).join(";")}}`;
  void loadUiFont(snapshot.uiFont).catch(() => undefined);
  void loadCodeFont(snapshot.codeFont).catch(() => undefined);
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
  "--background",
  "--surface",
  "--surface-raised",
  "--sidebar",
  "--border",
  "--border-strong",
  "--text",
  "--text-muted",
  "--text-subtle",
  "--accent",
  "--accent-hover",
  "--accent-subtle",
  "--accent-foreground",
  "--success",
  "--success-subtle",
  "--warning",
  "--warning-subtle",
  "--danger",
  "--danger-subtle",
  "--info",
  "--info-subtle",
  "--focus-ring",
];

export { builtInThemes, getBuiltInTheme };
