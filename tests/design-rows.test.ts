// Regression (QA HIGH-1): a long author list in an "Up next" row made Today
// 492 px wide on a 390 px phone. The row meta must be able to wrap and the
// meta line must wrap the chip under it instead of pushing it off screen.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../design-system/components.css"), "utf8");

/** Declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector: string): Record<string, string> {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  if (!m) throw new Error(`rule not found: ${selector}`);
  const out: Record<string, string> = {};
  for (const decl of m[2].replace(/\/\*[\s\S]*?\*\//g, "").split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

describe("list rows never get wider than the screen", () => {
  it("row meta can shrink and wrap", () => {
    const meta = rule(".rr-row__meta");
    expect(meta["white-space"]).toBeUndefined();
    expect(meta["min-width"]).toBe("0");
    expect(meta["overflow-wrap"]).toBe("anywhere");
  });
  it("the meta line wraps; the chip keeps to the right", () => {
    expect(rule(".rr-row__line")["flex-wrap"]).toBe("wrap");
    const chip = rule(".rr-row__line > .rr-chip,\n.rr-row__line > .rr-status");
    expect(chip["margin-left"]).toBe("auto");
    expect(chip.flex).toBe("none");
  });
  it("the row body can shrink inside the grid", () => {
    expect(rule(".rr-row__body")["min-width"]).toBe("0");
  });
});
