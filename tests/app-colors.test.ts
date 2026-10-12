import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_GROUND, APP_GROUND_DARK, APP_INK } from "@/lib/app-colors";

const tokens = readFileSync(
  fileURLToPath(new URL("../design-system/tokens.css", import.meta.url)),
  "utf8",
);

// The dark theme block: `@media (prefers-color-scheme: dark) { :root { … } }`
const dark = tokens.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

function find(css: string, name: string): string {
  const m = css.match(new RegExp(`--rr-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m) throw new Error(`token --rr-${name} not found`);
  return m[1].toUpperCase();
}

describe("app colours (manifest, icons, theme-color)", () => {
  it("equal the design tokens", () => {
    expect(APP_GROUND.toUpperCase()).toBe(find(tokens, "ground"));
    expect(APP_INK.toUpperCase()).toBe(find(tokens, "ink"));
  });

  it("the dark theme-color equals the dark ground token", () => {
    expect(dark).not.toBe("");
    expect(APP_GROUND_DARK.toUpperCase()).toBe(find(dark, "ground"));
  });
});
