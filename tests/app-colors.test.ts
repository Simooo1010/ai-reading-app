import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_GROUND, APP_INK } from "@/lib/app-colors";

const tokens = readFileSync(
  fileURLToPath(new URL("../design-system/tokens.css", import.meta.url)),
  "utf8",
);

function token(name: string): string {
  const m = tokens.match(new RegExp(`--rr-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m) throw new Error(`token --rr-${name} not found`);
  return m[1].toUpperCase();
}

describe("app colours (manifest, icons, theme-color)", () => {
  it("equal the design tokens", () => {
    expect(APP_GROUND.toUpperCase()).toBe(token("ground"));
    expect(APP_INK.toUpperCase()).toBe(token("ink"));
  });
});
