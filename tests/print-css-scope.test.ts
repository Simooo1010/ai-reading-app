import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRINT_PAGE_RULE } from "@/lib/print/screen";

// design-system/print.css stays loaded after a client-side Back from the
// print screen (next/link). Its print rules must then do nothing, or Today /
// Path / Progress would print blank or on A4 with no margin.

const ROOT = resolve(__dirname, "..");
const css = readFileSync(resolve(ROOT, "design-system/print.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Body of every `@media print { … }` block (brace matched). */
function printBlocks(text: string): string[] {
  const out: string[] = [];
  const re = /@media\s+print\s*\{/g;
  while (re.exec(text)) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    out.push(text.slice(re.lastIndex, i - 1));
  }
  return out;
}

/** Each selector (comma split) of the rules directly inside a block. */
function selectors(block: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < block.length; i++) {
    const c = block[i];
    if (c === "{") {
      if (depth === 0) {
        // Commas inside :has()/:not() do not split selectors.
        let level = 0;
        let part = "";
        for (const ch of block.slice(start, i)) {
          if (ch === "(") level++;
          if (ch === ")") level--;
          if (ch === "," && level === 0) {
            out.push(part.trim());
            part = "";
          } else part += ch;
        }
        out.push(part.trim());
      }
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) start = i + 1;
    }
  }
  return out.filter(Boolean);
}

/** The selector with every :not(…) group removed (nested brackets matched). */
function withoutNot(sel: string): string {
  let out = "";
  for (let i = 0; i < sel.length; i++) {
    if (sel.startsWith(":not(", i)) {
      let depth = 0;
      for (i += 4; i < sel.length; i++) {
        if (sel[i] === "(") depth++;
        else if (sel[i] === ")" && --depth === 0) break;
      }
    } else out += sel[i];
  }
  return out;
}

describe("print.css is harmless outside the print screen", () => {
  it("has no @page rule (it cannot be scoped by a selector)", () => {
    expect(css).not.toMatch(/@page/);
  });

  it("scopes every @media print selector to the print screen", () => {
    const blocks = printBlocks(css);
    expect(blocks.length).toBeGreaterThan(0);
    const all = blocks.flatMap(selectors);
    expect(all.length).toBeGreaterThan(5);
    for (const sel of all) {
      // A bare html / body / element selector would also hit Today, Path,
      // Progress. `.rr-print` inside :not() does not count.
      expect(withoutNot(sel), sel).toMatch(/rr-print/);
    }
  });

  it("keeps A4 / no margin on the print screen itself", () => {
    expect(PRINT_PAGE_RULE).toMatch(/@page\s*\{[^}]*size:\s*A4;[^}]*margin:\s*0;/);
    const client = readFileSync(resolve(ROOT, "components/print/PrintClient.tsx"), "utf8");
    expect(client).toMatch(/<style>\{PRINT_PAGE_RULE\}<\/style>/);
  });
});
