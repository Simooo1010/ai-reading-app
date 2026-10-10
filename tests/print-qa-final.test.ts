// Regressions from the final QA (print). Real saved pages only
// (tests/fixtures/print); small hand-made DOMs and objects for the helpers.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { removeControlLabels } from "@/lib/print/convert";
import { extractPrintable } from "@/lib/print/extract";
import { emptyReport } from "@/lib/print/fidelity";
import { formatCheckLine, noticeWarnings, pageCheck } from "@/lib/print/format";
import { dropRepeatedTitle } from "@/lib/print/generic";
import { countImagesNotLoaded } from "@/lib/print/options";
import type { FidelityCheck, PrintElement, PrintWarning } from "@/lib/print/types";

const DIR = "tests/fixtures/print";

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function textOf(e: PrintElement): string {
  return "html" in e ? plain(e.html) : e.type === "list" ? plain(e.items.join(" ")) : "";
}

function doc(html: string): Document {
  return new JSDOM(html, { url: "https://example.com/p" }).window.document;
}

// ─── MEDIUM-1: arXiv front matter ─────────────────────────────────────

describe("arXiv HTML printouts: title once, clean author block (QA MEDIUM-1)", () => {
  // Words found/printed BEFORE the fix (HEAD a58a743), for the 2 % rule.
  const cases = [
    { file: "16-arxiv.org-html.html", url: "https://arxiv.org/html/1706.03762", before: 6065, title: "Attention Is All You Need", authors: ["Ashish Vaswani (Google Brain;", "Noam Shazeer (Google Brain;", "Equal contribution. Listing order is random."] },
    { file: "55-arxiv.org-html.html", url: "https://arxiv.org/html/2401.05566", before: 31752, title: "Sleeper Agents: Training Deceptive LLMs that Persist Through Safety Training", authors: ["Evan Hubinger, Carson Denison, Jesse Mu, Mike Lambert", "Core research contributor."] },
    { file: "182-arxiv.org-html.html", url: "https://arxiv.org/html/2510.03215", before: 13719, title: "Cache-to-Cache: Direct Semantic Communication Between Large Language Models", authors: ["Tianyu Fu (Tsinghua University; Infinigence AI)", "Zihan Min, Hanling Zhang", "Wanli Ouyang (The Chinese University of Hong Kong; SLAI; Shanghai AI Laboratory)", "Corresponding author: Yu Wang"] },
  ];

  for (const c of cases) {
    describe(c.file, () => {
      const r = extractPrintable(readFileSync(`${DIR}/${c.file}`, "utf8"), c.url, { source: "arxiv-html", httpStatus: 200 });
      const els = r.document!.elements;
      // The front matter: everything before the "Abstract" heading.
      const abstractAt = els.findIndex((e) => e.type === "heading" && textOf(e) === "Abstract");
      const front = els.slice(0, abstractAt).map(textOf).join("\n");

      it("prints the title once (in the header), not again as a heading", () => {
        expect(r.document!.title).toBe(c.title);
        expect(abstractAt).toBeGreaterThan(0);
        expect(front).not.toContain(c.title);
        expect(els.some((e) => e.type === "heading" && textOf(e) === c.title)).toBe(false);
      });

      it("author block has no LaTeXML noise", () => {
        expect(front).not.toMatch(/thanks:/i);
        expect(front).not.toMatch(/footnotemark/i);
        expect(front).not.toMatch(/Affiliation:/);
        expect(front).not.toMatch(/Email:/);
        // LaTeXML marks ("††thanks:", "† footnotemark") are gone; the paper's own
        // affiliation symbols after a name (e.g. "Jan Brauner∘") may stay.
        expect(front).not.toMatch(/††/);
        for (const a of c.authors) expect(front).toContain(a);
      });

      it("removed text is counted as removed on purpose, and the word ratio stays within 2 %", () => {
        const k = r.check;
        expect(k.withinTolerance).toBe(true);
        expect(k.wordsPrinted).toBe(k.wordsFound);
        expect(k.widgetWords).toBe(c.before - k.wordsFound);
        expect(k.widgetsRemoved).toBeGreaterThan(0);
        expect(Math.abs(k.wordsPrinted / c.before - 1)).toBeLessThanOrEqual(0.02);
        expect(r.status).toBe("ok");
      });
    });
  }
});

describe("dropRepeatedTitle", () => {
  const d = doc("<p>x</p>");
  const h = (html: string): PrintElement => ({ type: "heading", level: 1, html });
  it("drops only a FIRST heading equal to the title", () => {
    const a: PrintElement[] = [h("The  <em>Title</em>"), { type: "paragraph", html: "Body" }];
    expect(dropRepeatedTitle(a, "The Title", d)).toBe(2);
    expect(a).toHaveLength(1);
    const b: PrintElement[] = [{ type: "paragraph", html: "Intro" }, h("The Title")];
    expect(dropRepeatedTitle(b, "The Title", d)).toBe(0);
    expect(b).toHaveLength(2);
    const c: PrintElement[] = [h("The Title, part 2")];
    expect(dropRepeatedTitle(c, "The Title", d)).toBe(0);
    const p: PrintElement[] = [{ type: "paragraph", html: "The Title" }];
    expect(dropRepeatedTitle(p, "The Title", d)).toBe(0);
  });
});

// ─── LOW-4: page controls ─────────────────────────────────────────────

describe("standalone page controls are removed (QA LOW-4)", () => {
  it("nber.org (fixture 74): no 'Copy Citation' / 'Download Citation', counted as widgets", () => {
    const r = extractPrintable(readFileSync(`${DIR}/74-www.nber.org.html`, "utf8"), "https://www.nber.org/papers/w32487", { httpStatus: 200 });
    const printed = r.document!.elements.map(textOf).join("\n");
    expect(printed).not.toMatch(/Copy Citation/);
    expect(printed).not.toMatch(/Download Citation/);
    // Real text stays: the abstract and the citation itself.
    expect(printed).toContain("This paper evaluates claims about large macroeconomic implications of new advances in AI.");
    expect(printed).toContain('Daron Acemoglu, "The Simple Macroeconomics of AI," NBER Working Paper 32487 (2024)');
    expect(r.check.widgetsRemoved).toBe(2);
    expect(r.check.widgetWords).toBe(4);
    expect(r.check.wordsPrinted).toBe(r.check.wordsFound);
  });

  it("keeps the same words inside prose, headings, cells and longer labels", () => {
    const d = doc(`<div id="root">
      <p>Please <a href="/s">share</a> this with a friend.</p>
      <h2>Share</h2>
      <table><tr><td>Save</td></tr></table>
      <p>Save the date</p>
      <ul><li>Email</li><li>Phone</li></ul>
      <ul class="share"><li><a href="mailto:?">Email</a></li></ul>
      <div><button>Share</button></div>
      <div class="x">Copy Citation</div>
      <p><a href="#">Print this page</a></p>
      <span>Bookmark</span>
    </div>`);
    const root = d.getElementById("root")!;
    const report = emptyReport();
    const n = removeControlLabels(root, report);
    const text = root.textContent!.replace(/\s+/g, " ").trim();
    expect(text).toContain("Please share this with a friend.");
    expect(text).toContain("Save the date");
    expect(root.querySelector("h2")?.textContent).toBe("Share");
    expect(root.querySelector("td")?.textContent).toBe("Save");
    expect(text).not.toContain("Copy Citation");
    expect(text).not.toContain("Print this page");
    expect(text).not.toContain("Bookmark");
    expect(root.querySelector("button")).toBeNull();
    // Plain list text stays; a share-menu link whose whole text is "Email" goes.
    expect(root.querySelector("ul")?.textContent).toBe("EmailPhone");
    expect(root.querySelector("ul.share a")).toBeNull();
    expect(n).toBe(report.widgetsRemoved);
    expect(report.widgetWords).toBe(1 + 2 + 3 + 1 + 1); // Share, Copy Citation, Print this page, Bookmark, Email
  });
});

// ─── LOW-5: subtitle repeating the first block ────────────────────────

describe("Substack #81: subtitle equal to the first block is not printed twice (QA LOW-5)", () => {
  const r = extractPrintable(
    readFileSync(`${DIR}/81-titotal.substack.com.html`, "utf8"),
    "https://titotal.substack.com/p/a-deep-critique-of-ai-2027s-bad-timeline",
    { httpStatus: 200 },
  );
  it("keeps the block, drops the subtitle", () => {
    expect(r.document!.subtitle).toBe("");
    expect(textOf(r.document!.elements[0])).toBe("Disclaimers:");
  });
  it("fidelity counts are unchanged (HEAD: 12,342 found and printed, 40 of 40 images)", () => {
    expect(r.check.wordsFound).toBe(12342);
    expect(r.check.wordsPrinted).toBe(12342);
    expect(r.check.imagesKept).toBe(40);
    expect(r.check.widgetsRemoved).toBe(0);
  });
  it("a different subtitle stays (fixture 10)", () => {
    const t = extractPrintable(
      readFileSync(`${DIR}/10-helentoner.substack.com.html`, "utf8"),
      "https://helentoner.substack.com/p/unresolved-debates-about-the-future",
      { httpStatus: 200 },
    );
    expect(t.document!.subtitle.length).toBeGreaterThan(0);
  });
});

// ─── MEDIUM-2: images that did not load ───────────────────────────────

const CHECK: FidelityCheck = {
  wordsFound: 1000,
  wordsPrinted: 1000,
  placeholderWords: 0,
  imagesFound: 40,
  imagesKept: 40,
  tablesFound: 0,
  tablesKept: 0,
  codeFound: 0,
  codeKept: 0,
  embedsFound: 0,
  embedsPlaceholdered: 0,
  widgetsRemoved: 0,
  widgetWords: 0,
  skippedUnsupported: 0,
  wordsHidden: 0,
  wordsPage: 1000,
  coverage: 1,
  ratio: 1,
  withinTolerance: true,
  details: [],
};

describe("check line when images could not be loaded (QA MEDIUM-2)", () => {
  const base = { check: CHECK, excludedEmbeds: 0, removedImages: 0, excludedWords: 0, wordsOnPages: 1000 };

  it("all images loaded: Check passed", () => {
    const r = pageCheck(base);
    expect(r.imagesNotLoaded).toBe(0);
    expect(r.checkLine).toContain("Images: 40 of 40.");
    expect(r.checkLine).toContain("Check passed.");
  });

  it("some failed: says how many and never 'Check passed'", () => {
    const r = pageCheck({ ...base, imagesNotLoaded: 3 });
    expect(r.imagesNotLoaded).toBe(3);
    expect(r.checkLine).toContain("Images: 37 of 40.");
    expect(r.checkLine).toContain("Check: all words are here, but 3 images could not be loaded: the printout shows their web addresses instead.");
    expect(r.checkLine).not.toContain("Check passed");
    expect(r.mismatch).toBe(false); // printing stays allowed
  });

  it("one failed: singular", () => {
    expect(pageCheck({ ...base, imagesNotLoaded: 1 }).checkLine).toContain("1 image could not be loaded: the printout shows its web address instead.");
  });

  it("with a failed word check, both are said", () => {
    const line = formatCheckLine({ ...CHECK, wordsPrinted: 900, ratio: 0.9, withinTolerance: false }, { imagesNotLoaded: 2 });
    expect(line).toContain("Check failed: about 10% of the words are not in the printout.");
    expect(line).toContain("2 images could not be loaded");
  });

  it("never more than the images kept", () => {
    expect(pageCheck({ ...base, imagesNotLoaded: 99 }).imagesNotLoaded).toBe(40);
  });

  it("countImagesNotLoaded counts failed and unusable printed images once each", () => {
    const img = (src: string): PrintElement => ({ type: "image", src, alt: "", caption: "" });
    const els: PrintElement[] = [
      img("https://a.example/1.png"),
      img("https://a.example/2.png"),
      img("javascript:alert(1)"),
      { type: "paragraph", html: "text" },
    ];
    expect(countImagesNotLoaded(els, new Set())).toBe(1);
    expect(countImagesNotLoaded(els, new Set(["https://a.example/2.png", "https://other/x.png"]))).toBe(2);
  });
});

// ─── LOW-3: the partial notice says each reason once ──────────────────

describe("noticeWarnings (QA LOW-3)", () => {
  const w = (code: PrintWarning["code"], message: string): PrintWarning => ({ code, message });
  const abstract = w("abstract-only", "This page seems to have only a summary. The full text may be in a PDF or on another page.");

  it("too-short: the bullet that repeats the headline is not listed", () => {
    expect(noticeWarnings("too-short", [abstract])).toEqual([]);
    expect(noticeWarnings("too-short", [w("too-short", "There is very little text on this page.")])).toEqual([]);
  });

  it("paywalled: the paywall bullet is not listed; other warnings stay", () => {
    const hidden = w("hidden-content", "Some collapsed or hidden parts of the page are not printed.");
    expect(noticeWarnings("paywalled", [w("paywall", "Only the free part is in the printout."), hidden])).toEqual([hidden.message]);
  });

  it("warning status keeps every message, once", () => {
    const p = w("placeholders", "Videos and other embeds are printed as links.");
    expect(noticeWarnings("warning", [p, p, abstract])).toEqual([p.message, abstract.message]);
  });

  it("fixture 74 (paper summary page): no bullet repeats the message", () => {
    const r = extractPrintable(readFileSync(`${DIR}/74-www.nber.org.html`, "utf8"), "https://www.nber.org/papers/w32487", { httpStatus: 200 });
    expect(r.status).toBe("too-short");
    expect(noticeWarnings(r.status, r.warnings)).toEqual([]);
  });
});
