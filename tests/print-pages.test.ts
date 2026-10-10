// Page packing (SPEC.md §7.4 acceptance: "heading stays with the next block,
// figure does not split"). Synthetic heights only (a pure algorithm).
import { describe, expect, it } from "vitest";
import {
  A4_HEIGHT_MM,
  contentHeightPx,
  elementTraits,
  isLeadIn,
  MM_PX,
  packPages,
  type PackBlock,
  type PackedPage,
  sheetsFor,
} from "@/lib/print/pages";
import type { PrintElement } from "@/lib/print/types";

type Kind = "p" | "h" | "img" | "lead" | "zero";

/** Blocks from a compact spec: [kind, height]. */
function blocks(spec: [Kind, number][]): PackBlock[] {
  return spec.map(([k, h], i) => ({
    id: `${k}${i}`,
    height: h,
    keepWithNext: k === "h" || k === "lead" || k === "zero",
    breakable: k === "p" || k === "lead",
    atomic: k === "img",
  }));
}

const ids = (pages: PackedPage[]) => pages.map((p) => p.ids);

/** Invariants that must hold for any input. */
function checkInvariants(input: PackBlock[], pages: PackedPage[], H: number) {
  // Every block exactly once, in order.
  expect(pages.flatMap((p) => p.ids)).toEqual(input.map((b) => b.id));
  const byId = new Map(input.map((b) => [b.id, b]));
  for (const p of pages) {
    expect(p.ids.length).toBeGreaterThan(0); // never an empty page
    const sum = p.ids.reduce((s, id) => s + Math.max(0, byId.get(id)!.height || 0), 0);
    expect(p.height).toBeCloseTo(sum, 6);
    if (!p.flow) expect(sum).toBeLessThanOrEqual(H + 1e-6); // a fixed page never overflows
    if (p.flow) expect(p.ids.some((id) => byId.get(id)!.height > H)).toBe(true); // flow only for a tall block
  }
  // No trailing page made only of zero-height blocks.
  if (pages.length > 1) {
    const last = pages[pages.length - 1];
    expect(last.ids.some((id) => (byId.get(id)!.height || 0) > 0)).toBe(true);
  }
}

describe("packPages: basics", () => {
  it("returns no pages for no blocks", () => {
    expect(packPages([], 100)).toEqual([]);
  });

  it("puts everything on one page when it fits exactly", () => {
    const b = blocks([["p", 40], ["p", 60]]);
    const pages = packPages(b, 100);
    expect(ids(pages)).toEqual([["p0", "p1"]]);
    expect(pages[0].flow).toBe(false);
    expect(pages[0].height).toBe(100);
  });

  it("starts a new page when the next block does not fit (blocks are never split)", () => {
    const b = blocks([["p", 60], ["p", 50], ["p", 30]]);
    expect(ids(packPages(b, 100))).toEqual([["p0"], ["p1", "p2"]]);
  });

  it("keeps the order of blocks", () => {
    const spec: [Kind, number][] = Array.from({ length: 50 }, (_, i) => ["p", 10 + ((i * 37) % 60)] as [Kind, number]);
    const b = blocks(spec);
    const pages = packPages(b, 200);
    checkInvariants(b, pages, 200);
  });

  it("treats NaN, negative and missing heights as zero", () => {
    const b = blocks([["p", Number.NaN], ["p", -5], ["p", 50]]);
    const pages = packPages(b, 100);
    expect(ids(pages)).toEqual([["p0", "p1", "p2"]]);
    expect(pages[0].height).toBe(50);
  });

  it("survives a zero or invalid page height (every block becomes a flow page, nothing lost)", () => {
    const b = blocks([["p", 10], ["p", 20]]);
    const pages = packPages(b, 0);
    expect(pages.flatMap((p) => p.ids)).toEqual(["p0", "p1"]);
    expect(pages.every((p) => p.flow)).toBe(true);
  });
});

describe("packPages: keep with next", () => {
  it("moves a heading at the bottom of a page to the next page with its paragraph", () => {
    const b = blocks([["p", 70], ["h", 20], ["p", 40]]);
    expect(ids(packPages(b, 100))).toEqual([["p0"], ["h1", "p2"]]);
  });

  it("moves a chain (heading + subheading) together", () => {
    const b = blocks([["p", 60], ["h", 15], ["h", 15], ["p", 30]]);
    expect(ids(packPages(b, 100))).toEqual([["p0"], ["h1", "h2", "p3"]]);
  });

  it("keeps a lead-in line ending with ':' with the figure after it", () => {
    const b = blocks([["p", 50], ["lead", 20], ["img", 60]]);
    expect(ids(packPages(b, 100))).toEqual([["p0"], ["lead1", "img2"]]);
  });

  it("does not move the chain when the chain and the next block cannot share a page", () => {
    // heading 30 + image 90 > 100: moving the heading would not help.
    const b = blocks([["p", 50], ["h", 30], ["img", 90]]);
    expect(ids(packPages(b, 100))).toEqual([["p0", "h1"], ["img2"]]);
  });

  it("never empties a page: a page made only of a chain stays", () => {
    const b = blocks([["h", 50], ["h", 40], ["p", 80]]);
    const pages = packPages(b, 100);
    expect(ids(pages)).toEqual([["h0", "h1"], ["p2"]]);
  });

  it("a heading that is the last block stays where it is", () => {
    const b = blocks([["p", 80], ["h", 20]]);
    expect(ids(packPages(b, 100))).toEqual([["p0", "h1"]]);
  });

  it("a heading never ends a page when the next block fits with it", () => {
    const spec: [Kind, number][] = [];
    for (let i = 0; i < 40; i++) spec.push(i % 4 === 0 ? ["h", 12] : ["p", 18 + ((i * 13) % 40)]);
    const b = blocks(spec);
    const H = 150;
    const pages = packPages(b, H);
    checkInvariants(b, pages, H);
    const byId = new Map(b.map((x) => [x.id, x]));
    pages.forEach((p, i) => {
      if (i === pages.length - 1) return;
      const last = byId.get(p.ids[p.ids.length - 1])!;
      if (!last.keepWithNext) return;
      // Allowed only when the page is all chain, or chain + next block do not fit together.
      const next = byId.get(pages[i + 1].ids[0])!;
      let chain = 0;
      for (let k = p.ids.length - 1; k >= 0 && byId.get(p.ids[k])!.keepWithNext; k--) chain += byId.get(p.ids[k])!.height;
      const allChain = p.ids.every((id) => byId.get(id)!.keepWithNext);
      expect(allChain || chain + next.height > H).toBe(true);
    });
  });
});

describe("packPages: figures and tall blocks", () => {
  it("never splits a figure that fits on a page", () => {
    const b = blocks([["p", 40], ["img", 70], ["p", 10]]);
    const pages = packPages(b, 100);
    expect(ids(pages)).toEqual([["p0"], ["img1", "p2"]]);
    expect(pages.every((p) => !p.flow)).toBe(true);
  });

  it("gives a block taller than a page its own flow page and goes on after it", () => {
    const b = blocks([["p", 30], ["p", 250], ["p", 30]]);
    const pages = packPages(b, 100);
    expect(ids(pages)).toEqual([["p0"], ["p1"], ["p2"]]);
    expect(pages.map((p) => p.flow)).toEqual([false, true, false]);
  });

  it("takes the heading before a tall block into the flow page", () => {
    const b = blocks([["p", 30], ["h", 10], ["p", 250], ["p", 20]]);
    const pages = packPages(b, 100);
    expect(ids(pages)).toEqual([["p0"], ["h1", "p2"], ["p3"]]);
    expect(pages[1].flow).toBe(true);
  });

  it("a tall block first in the document makes no empty page before it", () => {
    const b = blocks([["p", 300], ["p", 20]]);
    const pages = packPages(b, 100);
    expect(ids(pages)).toEqual([["p0"], ["p1"]]);
    expect(pages[0].flow).toBe(true);
  });

  it("joins tall blocks that follow each other into one flow page", () => {
    const b = blocks([["p", 300], ["p", 200], ["h", 10], ["p", 400], ["p", 50]]);
    const pages = packPages(b, 100);
    expect(ids(pages)).toEqual([["p0", "p1", "h2", "p3"], ["p4"]]);
    expect(pages.map((p) => p.flow)).toEqual([true, false]);
  });

  it("a short block between two tall ones ends the flow page", () => {
    const b = blocks([["p", 300], ["p", 20], ["p", 300]]);
    const pages = packPages(b, 100);
    expect(ids(pages)).toEqual([["p0"], ["p1"], ["p2"]]);
    expect(pages.map((p) => p.flow)).toEqual([true, false, true]);
  });

  it("a block exactly one page tall is not a flow page", () => {
    const pages = packPages(blocks([["img", 100], ["p", 1]]), 100);
    expect(pages.map((p) => p.flow)).toEqual([false, false]);
  });
});

describe("packPages: no empty or trailing blank pages", () => {
  it("joins a trailing zero-height block (removed-image marker) to the previous page", () => {
    const b = blocks([["p", 300], ["zero", 0]]);
    const pages = packPages(b, 100);
    expect(pages).toHaveLength(1);
    expect(pages[0].ids).toEqual(["p0", "zero1"]);
  });

  it("joins a zero-height block after a flow page to the next page", () => {
    const b = blocks([["p", 300], ["zero", 0], ["p", 30]]);
    const pages = packPages(b, 100);
    expect(ids(pages)).toEqual([["p0"], ["zero1", "p2"]]);
  });

  it("only zero-height blocks: one page", () => {
    const pages = packPages(blocks([["zero", 0], ["zero", 0]]), 100);
    expect(pages).toHaveLength(1);
  });

  it("random documents keep all invariants", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const kinds: Kind[] = ["p", "p", "p", "h", "img", "lead", "zero"];
    for (let run = 0; run < 200; run++) {
      const n = 1 + Math.floor(rnd() * 60);
      const H = 50 + Math.floor(rnd() * 400);
      const spec: [Kind, number][] = [];
      for (let i = 0; i < n; i++) {
        const k = kinds[Math.floor(rnd() * kinds.length)];
        const h = k === "zero" ? 0 : rnd() < 0.05 ? H * (1 + rnd() * 3) : rnd() * H * 0.7;
        spec.push([k, h]);
      }
      const b = blocks(spec);
      checkInvariants(b, packPages(b, H), H);
    }
  });
});

describe("sheetsFor and page sizes", () => {
  it("a fixed page is one sheet; a flow page needs ceil(height / content)", () => {
    expect(sheetsFor({ ids: ["a"], flow: false, height: 999 }, 100)).toBe(1);
    expect(sheetsFor({ ids: ["a"], flow: true, height: 250 }, 100)).toBe(3);
    expect(sheetsFor({ ids: ["a"], flow: true, height: 200 }, 100)).toBe(2);
  });

  it("A4 content height follows the margin", () => {
    expect(MM_PX).toBeCloseTo(3.7795, 3);
    expect(contentHeightPx(0)).toBeCloseTo(A4_HEIGHT_MM * MM_PX, 6);
    expect(contentHeightPx(25)).toBeCloseTo(247 * MM_PX, 6);
    expect(contentHeightPx(80)).toBeCloseTo(137 * MM_PX, 6);
  });
});

describe("elementTraits", () => {
  const p = (html: string, from?: "figcaption"): PrintElement => ({ type: "paragraph", html, ...(from ? { from } : {}) });

  it("headings stay with the next block", () => {
    expect(elementTraits({ type: "heading", level: 2, html: "Intro" }).keepWithNext).toBe(true);
  });

  it("a paragraph ending with ':' is a lead-in (tags and spaces ignored)", () => {
    expect(isLeadIn(p("like the following:"))).toBe(true);
    expect(isLeadIn(p("<strong>Note</strong>: <em>see below:</em>  "))).toBe(true);
    expect(isLeadIn(p("a normal sentence."))).toBe(false);
    expect(isLeadIn(p("time 10:30 today"))).toBe(false);
    expect(elementTraits(p("Steps:")).keepWithNext).toBe(true);
    expect(elementTraits(p("Steps.")).keepWithNext).toBe(false);
  });

  it("the block before a caption paragraph stays with the caption", () => {
    const cap = p("Figure 1: a chart", "figcaption");
    expect(elementTraits({ type: "placeholder", kind: "image", label: "Image not printed" }, cap).keepWithNext).toBe(true);
    expect(elementTraits({ type: "image", src: "https://x/a.png", caption: "", alt: "" }, cap).keepWithNext).toBe(true);
    expect(elementTraits({ type: "image", src: "https://x/a.png", caption: "", alt: "" }, p("text")).keepWithNext).toBe(false);
  });

  it("images, tables, code, embeds and placeholders are atomic; text is breakable", () => {
    expect(elementTraits({ type: "image", src: "https://x/a.png", caption: "", alt: "" }).atomic).toBe(true);
    expect(elementTraits({ type: "table", html: "<table></table>" }).atomic).toBe(true);
    expect(elementTraits({ type: "code", language: "", text: "x" }).atomic).toBe(true);
    expect(elementTraits({ type: "embed", provider: "youtube", url: "https://youtu.be/x" }).atomic).toBe(true);
    expect(elementTraits({ type: "placeholder", kind: "form", label: "Form" }).atomic).toBe(true);
    expect(elementTraits(p("text")).breakable).toBe(true);
    expect(elementTraits({ type: "list", ordered: false, items: ["a"] }).breakable).toBe(true);
    expect(elementTraits({ type: "blockquote", html: "q" }).breakable).toBe(true);
  });
});
