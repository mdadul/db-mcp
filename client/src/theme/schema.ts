import { z } from "zod";

export const semanticTokens = [
  "background", "surface", "surface-raised", "sidebar", "border", "border-strong",
  "text", "text-muted", "text-subtle", "accent", "accent-hover", "accent-subtle",
  "accent-foreground", "success", "success-subtle", "warning", "warning-subtle",
  "danger", "danger-subtle", "info", "info-subtle", "focus-ring",
] as const;

export type SemanticToken = (typeof semanticTokens)[number];

export const cssColorSchema = z.string().trim().min(1).max(100).refine((value) =>
  /^(#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|(?:rgb|rgba|hsl|hsla|oklch)\([^;{}]+\)|transparent|currentColor)$/i.test(value),
  "Use a CSS color value such as hex, rgb(), hsl(), or oklch().",
).refine((value) => typeof CSS === "undefined" || CSS.supports("color", value), "This value is not a supported CSS color.");

const cssColor = cssColorSchema;

const tokensSchema = z.object(Object.fromEntries(semanticTokens.map((token) => [token, cssColor])) as Record<SemanticToken, typeof cssColor>).strict();
const syntaxSchema = z.object({
  keyword: cssColor,
  string: cssColor,
  number: cssColor,
  comment: cssColor,
  function: cssColor,
  operator: cssColor,
  type: cssColor,
  punctuation: cssColor,
}).strict();

export const themeVariantSchema = z.object({
  tokens: tokensSchema,
  chart: z.array(cssColor).min(6).max(10),
  syntax: syntaxSchema,
}).strict();

export const themeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(80),
  author: z.string().trim().max(80).optional(),
  version: z.literal(1),
  allowsAccent: z.boolean(),
  variants: z.object({ light: themeVariantSchema.optional(), dark: themeVariantSchema.optional() })
    .strict().refine((variants) => Boolean(variants.light || variants.dark), "A theme needs a light or dark variant."),
}).strict();

export type ThemeVariant = z.infer<typeof themeVariantSchema>;
export type ThemeDefinition = z.infer<typeof themeSchema>;

export const themeSettingsSchema = z.object({
  themeId: z.string().default("default"),
  mode: z.enum(["system", "light", "dark"]).default("system"),
  accent: z.enum(["blue", "violet", "green", "orange", "pink", "graphite"]).default("blue"),
  density: z.enum(["compact", "default", "comfortable"]).default("default"),
  fontSize: z.union([z.literal(12), z.literal(13), z.literal(14), z.literal(15), z.literal(16), z.literal(17), z.literal(18)]).default(14),
  uiFont: z.enum(["system", "inter", "ibm-plex-sans", "source-sans-3", "atkinson-hyperlegible", "custom"]).default("system"),
  uiFontCustom: z.string().max(64).regex(/^[A-Za-z0-9 _-]*$/).default(""),
  codeFont: z.enum(["system-mono", "jetbrains-mono", "fira-code", "ibm-plex-mono", "source-code-pro", "custom"]).default("system-mono"),
  codeFontCustom: z.string().max(64).regex(/^[A-Za-z0-9 _-]*$/).default(""),
  codeFontSize: z.union([z.literal(11), z.literal(12), z.literal(13), z.literal(14), z.literal(15), z.literal(16), z.literal(17), z.literal(18), z.literal(19), z.literal(20)]).default(13),
  codeLigatures: z.boolean().default(false),
});

export type ThemeSettings = z.infer<typeof themeSettingsSchema>;
