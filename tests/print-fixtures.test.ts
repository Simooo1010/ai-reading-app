// Acceptance tests on real saved pages (SPEC.md §7.4). No network.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { extractAndInspect, extractPrintable } from "@/lib/print/extract";
import { countWords, formatCheckLine, visibleText } from "@/lib/print/fidelity";
import { placeholderText, type PrintResult, type PrintStatus } from "@/lib/print/types";

const DIR = "tests/fixtures/print";

interface Fx {
  file: string;
  url: string;
  status: PrintStatus;
  source?: PrintResult["source"];
  /** Real <p> paragraphs are compared with the output (skip for blocked/empty). */
  paragraphs?: boolean;
}

const FIXTURES: Fx[] = [
  // Substack (5+)
  { file: "81-titotal.substack.com.html", url: "https://titotal.substack.com/p/a-deep-critique-of-ai-2027s-bad-timeline", status: "ok", source: "substack", paragraphs: true },
  { file: "157-www.hyperdimensional.co.html", url: "https://www.hyperdimensional.co/p/among-the-agents", status: "ok", source: "substack", paragraphs: true },
  { file: "10-helentoner.substack.com.html", url: "https://helentoner.substack.com/p/unresolved-debates-about-the-future", status: "warning", source: "substack", paragraphs: true },
  { file: "29-www.dwarkesh.com.html", url: "https://www.dwarkesh.com/p/demis-hassabis", status: "warning", source: "substack", paragraphs: true },
  { file: "132-garymarcus.substack.com.html", url: "https://garymarcus.substack.com/p/breaking-openais-efforts-at-pure", status: "ok", source: "substack", paragraphs: true },
  { file: "126-www.astralcodexten.com.html", url: "https://www.astralcodexten.com/p/claude-fights-back", status: "ok", source: "substack", paragraphs: true },
  { file: "handmade-substack-paywalled.html", url: "https://example.substack.com/p/paid-post", status: "paywalled", source: "substack", paragraphs: true },
  // Other web pages (5+)
  { file: "125-joecarlsmith.com.html", url: "https://joecarlsmith.com/2024/12/18/takes-on-alignment-faking-in-large-language-models/", status: "warning", source: "web", paragraphs: true },
  { file: "11-waitbutwhy.com.html", url: "https://waitbutwhy.com/2015/01/artificial-intelligence-revolution-1.html", status: "ok", source: "web", paragraphs: true },
  { file: "82-ai-2027.com.html", url: "https://ai-2027.com/research/timelines-forecast", status: "warning", source: "web", paragraphs: true },
  { file: "13-intelligence-curse.ai.html", url: "https://intelligence-curse.ai/", status: "ok", source: "web", paragraphs: true },
  { file: "15-papers.nips.cc.html", url: "https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html", status: "too-short", source: "web" },
  { file: "74-www.nber.org.html", url: "https://www.nber.org/papers/w32487", status: "too-short", source: "web" },
  { file: "75-situational-awareness.ai.html", url: "https://situational-awareness.ai/from-gpt-4-to-agi/", status: "ok", source: "web", paragraphs: true },
  { file: "151-lexfridman.com.html", url: "https://lexfridman.com/demis-hassabis-2-transcript", status: "warning", source: "web", paragraphs: true },
  { file: "189-swarmtraces.org.html", url: "https://swarmtraces.org/", status: "warning", source: "web", paragraphs: true },
  { file: "26-epoch.ai.html", url: "https://epoch.ai/publications/can-ai-scaling-continue-through-2030", status: "warning", source: "web", paragraphs: true },
  // arXiv
  { file: "16-arxiv.org-html.html", url: "https://arxiv.org/html/1706.03762", status: "ok", source: "arxiv-html", paragraphs: true },
  { file: "16-arxiv.org.html", url: "https://arxiv.org/abs/1706.03762", status: "too-short", source: "web" },
  { file: "92-arxiv.org.html", url: "https://arxiv.org/abs/2005.04305", status: "too-short", source: "web" },
  // Blocked / thin / empty
  { file: "14-academic.oup.com.html", url: "https://academic.oup.com/mind/article/LIX/236/433/986238", status: "blocked" },
  { file: "38-karpathy.bearblog.dev.html", url: "https://karpathy.bearblog.dev/sequoia-ascent-2026/", status: "blocked" },
  { file: "handmade-js-shell.html", url: "https://example.com/essay", status: "too-short" },
  { file: "handmade-empty.html", url: "https://example.com/empty", status: "failed" },
];

interface Run {
  result: PrintResult;
  html: string;
  /** Non-empty real <p> in the converted content node (outside blockquotes, lists, tables, captions, embeds). */
  sourceParagraphs: number;
  ms: number;
}

const runs = new Map<string, Run>();

function countSourceParagraphs(node: Element): number {
  return Array.from(node.querySelectorAll("p")).filter((p) => {
    if (p.parentElement?.closest("blockquote, li, table, pre, figcaption, .tweet, .embedded-post-wrap, video, audio, object, dl")) {
      return false;
    }
    // Image captions written as <p class="wp-caption-text"> print as the image caption.
    if (p.matches(".wp-caption-text, .image-caption") && p.closest("figure, .wp-caption, .captioned-image-container")) return false;
    return countWords(visibleText(p)) > 0 || p.querySelector("math") !== null;
  }).length;
}

beforeAll(() => {
  for (const fx of FIXTURES) {
    const html = readFileSync(`${DIR}/${fx.file}`, "utf8");
    let sourceParagraphs = -1;
    const t = Date.now();
    const result = extractAndInspect(html, fx.url, {}, (node) => {
      sourceParagraphs = countSourceParagraphs(node);
    });
    runs.set(fx.file, { result, html, sourceParagraphs, ms: Date.now() - t });
  }
  // Per-fixture table for the report.
  const rows = FIXTURES.map((fx) => {
    const { result: r, ms } = runs.get(fx.file)!;
    const c = r.check;
    return [
      fx.file,
      r.status,
      c.wordsFound,
      c.wordsPrinted,
      c.ratio.toFixed(4),
      c.coverage.toFixed(2),
      r.warnings.map((w) => w.code).join(",") || "-",
      `${c.imagesKept}/${c.imagesFound}`,
      `${ms}ms`,
    ].join(" | ");
  });
  console.log(["fixture | status | wordsFound | wordsPrinted | ratio | coverage | warnings | images kept/found | time", ...rows].join("\n"));
}, 120_000);

function get(file: string): Run {
  const r = runs.get(file);
  if (!r) throw new Error(`fixture not run: ${file}`);
  return r;
}

describe("every fixture", () => {
  for (const fx of FIXTURES) {
    describe(fx.file, () => {
      it(`has status ${fx.status}`, () => {
        const { result } = get(fx.file);
        expect(result.status).toBe(fx.status);
        if (fx.source) expect(result.source).toBe(fx.source);
        expect(result.message.length).toBeGreaterThan(0);
      });

      it("output has no script, iframe, event handler or javascript: URL", () => {
        const json = JSON.stringify(get(fx.file).result.document ?? {});
        expect(json).not.toMatch(/<script/i);
        expect(json).not.toMatch(/<iframe/i);
        expect(json).not.toMatch(/\son[a-z]+=/i);
        expect(json).not.toMatch(/javascript:/i);
        expect(json).not.toMatch(/<style/i);
      });

      if (fx.status === "ok" || fx.status === "warning") {
        it("printed words are within 2 % of the words found, coverage computed", () => {
          const c = get(fx.file).result.check;
          expect(c.wordsFound).toBeGreaterThan(0);
          expect(Math.abs(1 - c.ratio)).toBeLessThanOrEqual(0.02);
          expect(c.withinTolerance).toBe(true);
          expect(c.coverage).toBeGreaterThan(0);
          expect(c.coverage).toBeCloseTo(c.wordsPrinted / c.wordsPage, 10);
        });

        it("keeps every image, table and code block it found", () => {
          const c = get(fx.file).result.check;
          expect(c.imagesKept).toBe(c.imagesFound);
          expect(c.tablesKept).toBe(c.tablesFound);
          expect(c.codeKept).toBe(c.codeFound);
        });

        it("has a title and every embed prints as a placeholder with its URL", () => {
          const d = get(fx.file).result.document!;
          expect(d.title.length).toBeGreaterThan(0);
          for (const e of d.elements) {
            if (e.type === "embed") {
              expect(placeholderText(e)).toMatch(/not printed/);
              if (e.url) expect(placeholderText(e)).toContain(e.url);
            }
          }
        });

        it("the check line says the check passed", () => {
          const line = formatCheckLine(get(fx.file).result.check);
          expect(line).toMatch(/^Words: [\d,]+ found, [\d,]+ printed\. Images: \d+ of \d+\. Tables: \d+ of \d+\./);
          expect(line).toContain("Check passed.");
          expect(line).not.toContain("Check failed");
        });
      }

      if (fx.paragraphs) {
        it("prints one paragraph per non-empty <p> (no merging)", () => {
          const { result, sourceParagraphs } = get(fx.file);
          const printed = result.document!.elements.filter((e) => e.type === "paragraph" && e.from === undefined).length;
          expect(sourceParagraphs).toBeGreaterThan(0);
          expect(printed).toBe(sourceParagraphs);
        });
      }
    });
  }
});

describe("specific fixtures", () => {
  it("Substack metadata: title, author, date and publication (also on custom domains)", () => {
    for (const f of [
      "81-titotal.substack.com.html",
      "157-www.hyperdimensional.co.html",
      "10-helentoner.substack.com.html",
      "29-www.dwarkesh.com.html",
      "132-garymarcus.substack.com.html",
      "126-www.astralcodexten.com.html",
    ]) {
      const d = get(f).result.document!;
      expect(d.title, f).not.toBe("");
      expect(d.author, f).not.toBe("");
      expect(d.date, f).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(d.publication, f).not.toBe("");
    }
    const acx = get("126-www.astralcodexten.com.html").result.document!;
    expect(acx.publication).toBe("Astral Codex Ten");
    expect(acx.author).toBe("Scott Alexander");
    expect(acx.subtitle).toBe(""); // its description is only "..."
    const hd = get("157-www.hyperdimensional.co.html").result.document!;
    expect(hd.publication).toBe("Hyperdimensional");
    const gm = get("132-garymarcus.substack.com.html").result.document!;
    expect(gm).toMatchObject({
      title: "Breaking: OpenAI's efforts at pure scaling have hit a wall.",
      author: "Gary Marcus",
      publication: "Marcus on AI",
      date: "2025-02-13T04:55:12.000Z",
    });
  });

  it("hyperdimensional: both code blocks of the page DOM are kept", () => {
    const { result } = get("157-www.hyperdimensional.co.html");
    // A raw grep finds 4 "<pre>" in the file, but 2 of them are inside the embedded JSON string, not in the DOM.
    expect(result.check.codeFound).toBe(2);
    const code = result.document!.elements.filter((e) => e.type === "code");
    expect(code).toHaveLength(2);
    expect(code[1]).toMatchObject({ text: "rm -rf ~" });
  });

  it("Helen Toner: the YouTube iframe becomes a video placeholder with its URL", () => {
    const d = get("10-helentoner.substack.com.html").result.document!;
    const embeds = d.elements.filter((e) => e.type === "embed");
    expect(embeds).toHaveLength(1);
    expect(placeholderText(embeds[0])).toMatch(/^Video not printed: https:\/\/www\.youtube\.com\/watch\?v=/);
  });

  it("Dwarkesh: YouTube, Spotify and Apple Podcasts embeds, long transcript kept", () => {
    const { result } = get("29-www.dwarkesh.com.html");
    const embeds = result.document!.elements.filter((e) => e.type === "embed");
    expect(embeds.map((e) => e.type === "embed" && e.provider)).toEqual(["youtube", "spotify", "apple-podcasts"]);
    expect(result.check.wordsPrinted).toBeGreaterThan(10_000);
    expect(result.warnings.map((w) => w.code)).toEqual(["placeholders"]);
  });

  it("paywalled Substack: status paywalled, free preview returned and flagged", () => {
    const { result } = get("handmade-substack-paywalled.html");
    expect(result.message).toBe("Only part of this post is public. The rest is for paid readers.");
    expect(result.warnings.map((w) => w.code)).toContain("paywall");
    const paras = result.document!.elements.filter((e) => e.type === "paragraph");
    expect(paras).toHaveLength(3);
    expect(JSON.stringify(result.document)).not.toContain("paid subscribers");
    expect(result.check.details.join(" ")).toMatch(/Paywall markers/);
  });

  it("a free Substack post that only talks about paid subscribers is not 'paywalled'", () => {
    const html = get("132-garymarcus.substack.com.html").html.replace(
      '<div class="body markup"',
      '<div class="body markup"><p>Note: this post is for paid subscribers only... just kidding, it is free.</p><div class="x"',
    );
    const r = extractPrintable(html, "https://garymarcus.substack.com/p/breaking-openais-efforts-at-pure");
    expect(r.status).toBe("ok");
  });

  it("Cloudflare challenge pages are blocked with the B1 message", () => {
    for (const f of ["14-academic.oup.com.html", "38-karpathy.bearblog.dev.html"]) {
      const { result } = get(f);
      expect(result.message).toBe("This site did not let us read the page. Open the source instead.");
      expect(result.document).toBeUndefined();
    }
  });

  it("thin pages: abstract pages, script shell, empty page", () => {
    expect(get("15-papers.nips.cc.html").result.warnings.map((w) => w.code)).toEqual(["abstract-only"]);
    expect(get("74-www.nber.org.html").result.warnings.map((w) => w.code)).toEqual(["abstract-only"]);
    expect(get("16-arxiv.org.html").result.message).toMatch(/summary page of a paper/);
    expect(get("handmade-js-shell.html").result.message).toBe(
      "We found very little text on this page. It may load its text with scripts or be only a summary.",
    );
    expect(get("handmade-empty.html").result.message).toBe("This page is empty. Open the source instead.");
  });

  it("a landing page is 'too-short' when the Notion reading time says the piece is much longer", () => {
    const html = get("13-intelligence-curse.ai.html").html;
    const r = extractPrintable(html, "https://intelligence-curse.ai/", { expectedMinutes: 140 });
    expect(r.status).toBe("too-short");
    expect(r.warnings[0].message).toMatch(/reading time/);
    // A normal article with its real reading time stays fine.
    const ok = extractPrintable(get("132-garymarcus.substack.com.html").html, "https://garymarcus.substack.com/p/breaking-openais-efforts-at-pure", {
      expectedMinutes: 5,
    });
    expect(ok.status).toBe("ok");
  });

  it("arXiv HTML: MathML kept, figures and tables kept, source arxiv-html", () => {
    const { result } = get("16-arxiv.org-html.html");
    const d = result.document!;
    expect(d.title).toBe("Attention Is All You Need");
    expect(d.author).toMatch(/Ashish Vaswani/);
    expect(JSON.stringify(d.elements)).toContain("<math");
    expect(JSON.stringify(d.elements)).not.toContain("<annotation");
    expect(d.elements.some((e) => e.type === "paragraph" && e.from === "equation")).toBe(true);
    expect(result.check.tablesFound).toBeGreaterThanOrEqual(4);
    expect(result.check.imagesFound).toBe(8);
    expect(d.elements.filter((e) => e.type === "image").every((e) => e.type === "image" && e.src.startsWith("https://arxiv.org/html/1706.03762v7/"))).toBe(true);
  });

  it("epoch.ai: words in collapsed sections and closed pop-ups are reported, not silently dropped", () => {
    const { result } = get("26-epoch.ai.html");
    expect(result.check.wordsHidden).toBeGreaterThan(1000);
    expect(result.warnings.map((w) => w.code)).toContain("hidden-content");
    expect(formatCheckLine(result.check)).toMatch(/words in collapsed or hidden parts of the page are not printed/);
  });

  it("a page that loses content fails the check, and the check line says so", () => {
    // Real Substack post with an unknown element full of text inside the article body.
    const lost = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const html = get("132-garymarcus.substack.com.html").html.replace(
      '<div class="body markup"',
      `<div class="body markup"><marquee>${lost}</marquee><div class="x"`,
    );
    const r = extractPrintable(html, "https://garymarcus.substack.com/p/breaking-openais-efforts-at-pure");
    expect(r.check.withinTolerance).toBe(false);
    expect(r.status).toBe("warning");
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["ratio-out-of-tolerance", "unsupported-content"]));
    const line = formatCheckLine(r.check);
    expect(line).toMatch(/Check failed: about \d+% of the words are not in the printout\./);
    expect(line).not.toContain("Check passed");
    const ph = r.document!.elements.find((e) => e.type === "placeholder");
    expect(ph && placeholderText(ph)).toBe("Part of the page not printed (60 words)");
  });

  it("the whole suite of fixtures runs fast enough (no page over 10 s)", () => {
    for (const fx of FIXTURES) expect(get(fx.file).ms, fx.file).toBeLessThan(10_000);
  });
});
