import assert from "node:assert/strict";
import test from "node:test";
import { contrastRatio } from "./contrast.ts";
import { builtInThemes } from "./themes.ts";

const ACCENTS = ["blue", "violet", "green", "orange", "pink", "graphite"] as const;
const MODES = ["light", "dark"] as const;

if (typeof (globalThis as { window?: unknown }).window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: false }) },
  });
}

const { resolveThemeSnapshot } = await import("./runtime.ts");

function resolveToken(variables: Record<string, string>, token: string): string | undefined {
  let value = variables[`--${token}`];
  for (let depth = 0; depth < 5 && value; depth += 1) {
    const reference = /^var\(--([a-z\d-]+)\)$/.exec(value);
    if (!reference) return value;
    value = variables[`--${reference[1]}`];
  }
  return value;
}

function themeSettings(themeId: string, mode: "light" | "dark", accent: (typeof ACCENTS)[number]) {
  return {
    themeId,
    mode,
    accent,
    density: "default" as const,
    fontSize: 14 as const,
    uiFont: "system" as const,
    uiFontCustom: "",
    codeFont: "system-mono" as const,
    codeFontCustom: "",
    codeFontSize: 13 as const,
    codeLigatures: false,
  };
}

for (const theme of builtInThemes) {
  for (const mode of MODES) {
    if (!theme.variants[mode]) continue;
    const accents = theme.allowsAccent ? ACCENTS : (["blue"] as const);
    for (const accent of accents) {
      test(`${theme.id} · ${mode} · ${accent}: filled accent text meets WCAG AA`, () => {
        const snapshot = resolveThemeSnapshot(themeSettings(theme.id, mode, accent));
        const primary = resolveToken(snapshot.variables, "primary");
        const foreground = resolveToken(snapshot.variables, "primary-foreground");
        const accentHover = resolveToken(snapshot.variables, "accent-hover");
        assert.ok(primary, "primary token is present");
        assert.ok(foreground, "primary-foreground token is present");
        assert.ok(accentHover, "accent-hover token is present");

        const base = contrastRatio(foreground, primary);
        assert.ok(base !== undefined, `primary colors are parseable (${primary} on ${foreground})`);
        assert.ok(
          base >= 4.5,
          `primary contrast ${base.toFixed(2)}:1 is below 4.5:1 (${foreground} on ${primary})`,
        );

        const hover = contrastRatio(foreground, accentHover);
        assert.ok(
          hover !== undefined,
          `accent-hover colors are parseable (${accentHover} on ${foreground})`,
        );
        assert.ok(
          hover >= 4.5,
          `accent-hover contrast ${hover.toFixed(2)}:1 is below 4.5:1 (${foreground} on ${accentHover})`,
        );
      });
    }
  }
}
