import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (f: string) =>
  readFileSync(fileURLToPath(new URL(`../design-system/${f}`, import.meta.url)), "utf8");

const tokens = read("tokens.css");
const components = read("components.css");
const print = read("print.css");

const COLOURS = ["ground", "on-ink", "ink", "ink-2", "wash", "rule", "hatch-opacity"] as const;

// Light = the first :root block; dark = the :root inside prefers-color-scheme: dark.
const darkMedia = tokens.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?)\n\}/);
const dark = darkMedia?.[1] ?? "";
const printBlock = tokens.match(/@media\s+print\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const light = tokens.slice(tokens.indexOf(":root"), tokens.indexOf("@media"));
const printOnlyBlock = printBlock;

function value(css: string, name: string): string {
  const m = css.match(new RegExp(`--rr-${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--rr-${name} not found`);
  return m[1].trim();
}

function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const tok = (css: string, n: string) => value(css, n);

describe("dark theme tokens", () => {
  it("has a dark block in prefers-color-scheme: dark that sets every colour token", () => {
    expect(darkMedia).not.toBeNull();
    expect(dark).toMatch(/:root\s*\{/);
    for (const name of COLOURS) expect(dark, name).toContain(`--rr-${name}:`);
  });

  it("is a pure swap of the two colours (no new hue)", () => {
    expect(tok(dark, "ground").toUpperCase()).toBe(tok(light, "ink").toUpperCase());
    expect(tok(dark, "ink").toUpperCase()).toBe(tok(light, "ground").toUpperCase());
    expect(tok(dark, "on-ink")).toBe(tok(dark, "ground"));
  });

  it("declares both schemes", () => {
    expect(light).toMatch(/color-scheme:\s*light dark/);
    expect(dark).toMatch(/color-scheme:\s*dark/);
  });

  it("meets WCAG contrast (AA, text pairs mostly AAA)", () => {
    const g = tok(dark, "ground");
    expect(contrast(tok(dark, "ink"), g)).toBeGreaterThanOrEqual(7);
    expect(contrast(tok(dark, "ink-2"), g)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tok(dark, "ink"), tok(dark, "wash"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tok(dark, "ink-2"), tok(dark, "wash"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tok(dark, "on-ink"), tok(dark, "ink"))).toBeGreaterThanOrEqual(7);
  });

  it("keeps hairlines and washes visible against the ground", () => {
    const g = tok(dark, "ground");
    expect(contrast(tok(dark, "rule"), g)).toBeGreaterThanOrEqual(1.5);
    expect(contrast(tok(dark, "wash"), g)).toBeGreaterThanOrEqual(1.2);
    for (const n of ["rule", "wash"]) {
      expect(tok(dark, n).toUpperCase(), n).not.toBe(g.toUpperCase());
      expect(tok(dark, n).toUpperCase(), n).not.toBe(tok(dark, "ink").toUpperCase());
    }
  });

  it("printing from a dark system restores the light values", () => {
    expect(printOnlyBlock).not.toBe("");
    expect(tokens.indexOf("@media print")).toBeGreaterThan(tokens.indexOf("prefers-color-scheme: dark"));
    for (const name of COLOURS) expect(value(printOnlyBlock, name), name).toBe(value(light, name));
  });

  it("light contrast stays as it was", () => {
    const g = tok(light, "ground");
    expect(contrast(tok(light, "ink"), g)).toBeGreaterThanOrEqual(7);
    expect(contrast(tok(light, "ink-2"), g)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tok(light, "ink-2"), tok(light, "wash"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps rule off text and the hatch lighter than a solid bar", () => {
    // `rule` is for hairlines only: never a text colour. The one allowed glyph is the
    // dot between meta words (.rr-sep), which is a separator, not text.
    const used: string[] = [];
    for (const m of components.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/(^|;|\s)(color|fill)\s*:\s*var\(--rr-rule\)/.test(m[2])) used.push(m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim());
    }
    expect(used).toEqual([".rr-sep"]);
    const op = parseFloat(tok(dark, "hatch-opacity"));
    expect(op).toBeGreaterThan(0.3);
    expect(op).toBeLessThan(1);
  });
});

describe("no hard-coded colours", () => {
  const colourLiteral =
    /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|color-mix\(|\b(?:Canvas|CanvasText|white|black|red|green|blue|gr[ae]y|silver|yellow|orange|purple|pink|brown|navy|teal)\b(?!-)/i;
  // Strip comments, and the data:image/svg+xml mask lines (their `black` is only opacity).
  const strip = (css: string) =>
    css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.includes("data:image/svg+xml"));

  it("components.css has none", () => {
    const lines = strip(components).filter((l) => colourLiteral.test(l));
    expect(lines).toEqual([]);
  });

  it("print.css has none outside the --rr-print-* paper variables", () => {
    const lines = strip(print).filter((l) => colourLiteral.test(l) && !/^\s*--rr-print-(paper|ink|ink-2|rule|wash):/.test(l));
    expect(lines).toEqual([]);
  });

  it("the dark block does not override the paper variables", () => {
    expect(dark).not.toContain("--rr-print-");
    expect(tokens).not.toContain("--rr-print-");
  });

  it("the paper sheet sets its own colours (no inheritance from the themed body)", () => {
    const sheet = print.match(/^\.rr-print-sheet\s*\{[\s\S]*?\n\}/m)?.[0] ?? "";
    expect(sheet).toContain("background-color: var(--rr-print-paper)");
    expect(sheet).toContain("color: var(--rr-print-ink)");
    expect(sheet).toMatch(/color-scheme:\s*light/);
  });
});

describe("no hard-coded colours in components", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const f = join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.tsx$/.test(e.name) && !/AppIconMark|icon\.tsx$|apple-icon\.tsx$|opengraph-image/.test(e.name)) files.push(f);
    }
  };
  const root = fileURLToPath(new URL("..", import.meta.url));
  walk(join(root, "app"));
  walk(join(root, "components"));

  it("scans the component files", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith("BrandMark.tsx"))).toBe(true);
  });

  it("has no #hex, and only none / currentColor in fill= and stroke=", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (/#[0-9a-fA-F]{3,8}\b/.test(src.replace(/\{?\/\*[\s\S]*?\*\/\}?|\/\/.*$/gm, ""))) bad.push(`${f}: hex`);
      for (const m of src.matchAll(/\b(fill|stroke)="([^"]*)"/g)) {
        if (!["none", "currentColor"].includes(m[2])) bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
