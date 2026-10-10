// Print customization (SPEC.md §7.4 "Customization"). Client-safe pure code.
// The print page stores these in localStorage; anything read back is checked
// here field by field, so a broken or old value never breaks the page.

export const PRINT_FORMATS = ["default", "monospace"] as const;
export type PrintFormat = (typeof PRINT_FORMATS)[number];

export const PRINT_FONTS = ["default", "sans", "serif", "times", "mono"] as const;
export type PrintFont = (typeof PRINT_FONTS)[number];

export interface PrintSettings {
  format: PrintFormat;
  font: PrintFont;
  /** Text size in points, 8-36. */
  size: number;
  /** Line spacing, 1.0-3.0 in steps of 0.1. */
  lineSpacing: number;
  /** Page margin in millimetres, 0-80. */
  margin: number;
  /** Leave out videos and other embeds (they print as links otherwise). */
  excludeEmbeds: boolean;
}

export const DEFAULT_SETTINGS: Readonly<PrintSettings> = Object.freeze({
  format: "default",
  font: "default",
  size: 12,
  lineSpacing: 1.6,
  margin: 25,
  excludeEmbeds: false,
});

export const LIMITS = {
  size: { min: 8, max: 36, step: 1 },
  lineSpacing: { min: 1, max: 3, step: 0.1 },
  margin: { min: 0, max: 80, step: 1 },
} as const;

export const SETTINGS_STORAGE_KEY = "rr-print-settings-v1";

export const FONT_LABELS: Record<PrintFont, string> = {
  default: "Format default",
  sans: "Modern Sans",
  serif: "Classic Serif",
  times: "Times New Roman",
  mono: "Typewriter",
};

export const FORMAT_LABELS: Record<PrintFormat, string> = {
  default: "Default",
  monospace: "Monospace",
};

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clampNumber(v: unknown, min: number, max: number, step: number, fallback: number): number {
  const n = toNumber(v);
  if (n === null) return fallback;
  const c = Math.min(max, Math.max(min, n));
  // Snap to the step without float noise (1.6000000000000001 -> 1.6).
  const snapped = Math.round(c / step) * step;
  const decimals = step < 1 ? String(step).split(".")[1].length : 0;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals));
}

function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/**
 * Settings from any input (an object, a partial object, a number string...):
 * each field is checked on its own; a wrong or missing field gets its default,
 * a number out of range is brought into range.
 */
export function clampSettings(input: unknown): PrintSettings {
  const o = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    format: isOneOf(PRINT_FORMATS, o.format) ? o.format : d.format,
    font: isOneOf(PRINT_FONTS, o.font) ? o.font : d.font,
    size: clampNumber(o.size, LIMITS.size.min, LIMITS.size.max, LIMITS.size.step, d.size),
    lineSpacing: clampNumber(o.lineSpacing, LIMITS.lineSpacing.min, LIMITS.lineSpacing.max, LIMITS.lineSpacing.step, d.lineSpacing),
    margin: clampNumber(o.margin, LIMITS.margin.min, LIMITS.margin.max, LIMITS.margin.step, d.margin),
    excludeEmbeds: typeof o.excludeEmbeds === "boolean" ? o.excludeEmbeds : d.excludeEmbeds,
  };
}

/** Settings from a stored string (JSON) or value. Never throws. */
export function parseSettings(raw: unknown): PrintSettings {
  if (typeof raw === "string") {
    try {
      return clampSettings(JSON.parse(raw));
    } catch {
      return clampSettings(null);
    }
  }
  return clampSettings(raw);
}

export function serializeSettings(s: PrintSettings): string {
  return JSON.stringify(clampSettings(s));
}

export function sameSettings(a: PrintSettings, b: PrintSettings): boolean {
  return (
    a.format === b.format &&
    a.font === b.font &&
    a.size === b.size &&
    a.lineSpacing === b.lineSpacing &&
    a.margin === b.margin &&
    a.excludeEmbeds === b.excludeEmbeds
  );
}
