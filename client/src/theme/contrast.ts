import { cssColorSchema, semanticTokens, type ThemeDefinition, type ThemeVariant } from "./schema";

type Rgb = readonly [number, number, number];

function parseColor(value: string): Rgb | undefined {
  const hex = value.match(/^#([\da-f]{3,8})$/i)?.[1];
  if (hex) {
    const expanded = hex.length <= 4 ? [...hex].map((part) => part + part).join("") : hex;
    if (expanded.length !== 6 && expanded.length !== 8) return undefined;
    return [
      Number.parseInt(expanded.slice(0, 2), 16) / 255,
      Number.parseInt(expanded.slice(2, 4), 16) / 255,
      Number.parseInt(expanded.slice(4, 6), 16) / 255,
    ];
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  const hsl = value.match(/^hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i);
  if (hsl) {
    const hue = ((Number(hsl[1]) % 360) + 360) % 360 / 360;
    const saturation = Number(hsl[2]) / 100;
    const lightness = Number(hsl[3]) / 100;
    const channel = (offset: number) => {
      const k = (offset + hue * 12) % 12;
      const a = saturation * Math.min(lightness, 1 - lightness);
      return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [channel(0), channel(8), channel(4)];
  }
  const oklch = value.match(/^oklch\(\s*([\d.]+)(%)?\s+([\d.]+)\s+([\d.]+)/i);
  if (oklch) {
    const l = Number(oklch[1]) / (oklch[2] ? 100 : 1);
    const c = Number(oklch[3]);
    const angle = Number(oklch[4]) * Math.PI / 180;
    const a = c * Math.cos(angle);
    const b = c * Math.sin(angle);
    const ll = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mm = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const ss = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const linear: Rgb = [4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss, -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss, -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss];
    const convert = (channel: number) => Math.max(0, Math.min(1, channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055));
    return [convert(linear[0]), convert(linear[1]), convert(linear[2])];
  }
  return undefined;
}

function luminance(color: Rgb): number {
  const channels = color.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: string, background: string): number | undefined {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return undefined;
  const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const ACCENT_FOREGROUND_CANDIDATES = ["#ffffff", "#111111"] as const;

export type AccentForeground = (typeof ACCENT_FOREGROUND_CANDIDATES)[number];

/**
 * Pick near-white or near-black text for a filled accent surface.
 * Maximizes the minimum contrast against the base and hover accents so primary
 * buttons stay legible in both states. If neither candidate reaches AA, returns
 * the better of the two.
 */
export function pickAccentForeground(accent: string, accentHover: string): AccentForeground {
  const score = (candidate: AccentForeground) => Math.min(
    contrastRatio(candidate, accent) ?? 0,
    contrastRatio(candidate, accentHover) ?? 0,
  );
  return ACCENT_FOREGROUND_CANDIDATES.reduce((best, candidate) => score(candidate) > score(best) ? candidate : best);
}

export interface ContrastFinding {
  variant: "light" | "dark";
  pair: string;
  ratio: number | undefined;
  passesAA: boolean;
}

export function checkThemeContrast(theme: ThemeDefinition): ContrastFinding[] {
  return (["light", "dark"] as const).flatMap((variantName) => {
    const variant = theme.variants[variantName];
    return variant ? checkVariantContrast(variant, variantName) : [];
  });
}

function checkVariantContrast(variant: ThemeVariant, variantName: "light" | "dark"): ContrastFinding[] {
  const backgrounds = ["background", "surface", "surface-raised", "sidebar"] as const;
  const foregrounds = ["text", "text-muted"] as const;
  return backgrounds.flatMap((background) => foregrounds.map((foreground) => {
    const ratio = contrastRatio(variant.tokens[foreground], variant.tokens[background]);
    return { variant: variantName, pair: `${foreground}/${background}`, ratio, passesAA: ratio !== undefined && ratio >= 4.5 };
  }));
}

export function missingSemanticTokens(tokens: Record<string, unknown>): string[] {
  return semanticTokens.filter((token) => !(token in tokens));
}

export function invalidCssColors(theme: ThemeDefinition): string[] {
  return (["light", "dark"] as const).flatMap((variantName) => {
    const variant = theme.variants[variantName];
    if (!variant) return [];
    return [
      ...Object.entries(variant.tokens).map(([name, value]) => [`${variantName}.${name}`, value] as const),
      ...variant.chart.map((value, index) => [`${variantName}.chart[${index}]`, value] as const),
      ...Object.entries(variant.syntax).map(([name, value]) => [`${variantName}.syntax.${name}`, value] as const),
    ].filter(([, value]) => !cssColorSchema.safeParse(value).success).map(([name]) => name);
  });
}
