// Regressions found in step 6c (Print run on every real link of the reading list).
// Real saved pages only (tests/fixtures/print); small hand-made DOMs for the helpers.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractPrintable, isScholarlyLanding } from "@/lib/print/extract";
import { arxivWatermarkDate, paragraphWordsMissing, stripNamedBoilerplate } from "@/lib/print/generic";
import { metaAll, metaContent } from "@/lib/print/meta";
import { countNodeWords, foreignObjectsOf, visibleText } from "@/lib/print/text";
import type { PrintElement } from "@/lib/print/types";

const DIR = "tests/fixtures/print";

function text(elements: PrintElement[]): string {
  return elements
    .map((e) => ("html" in e ? e.html : e.type === "list" ? e.items.join(" ") : e.type === "code" ? e.text : ""))
    .join("\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

function doc(html: string): Document {
  return new JSDOM(html, { url: "https://example.com/p" }).window.document;
}

describe("LessWrong post (fixture 186)", () => {
  const html = readFileSync(`${DIR}/186-www.lesswrong.com.html`, "utf8");
  const url = "https://www.lesswrong.com/posts/q5ejXr4CRuPxkgzJD/claude-opus-4-5-achieves-50-time-horizon-of-around-4-hrs-49";
  // Notion says 5 minutes; before the fix this printed 1,738 words (the comments) for a ~360-word post.
  const r = extractPrintable(html, url, { httpStatus: 200, expectedMinutes: 5 });
  const printed = text(r.document?.elements ?? []);

  it("prints the post as ok, not as a paper abstract", () => {
    expect(r.status).toBe("ok");
    expect(r.warnings.map((w) => w.code)).not.toContain("abstract-only");
  });

  it("does not print the comment thread or the page furniture", () => {
    expect(r.check.wordsPrinted).toBeGreaterThan(300);
    expect(r.check.wordsPrinted).toBeLessThan(450);
    expect(r.check.coverage).toBeLessThanOrEqual(1.05);
    expect(r.check.coverage).toBeGreaterThanOrEqual(0.95);
    expect(printed).not.toContain("Curated and popular this week");
    expect(printed).not.toContain("comments, sorted by");
    expect(printed).not.toContain("[comment deleted]");
  });

  it("keeps the whole post, to its last line", () => {
    expect(printed).toContain("The flat 80%-horizon while 50%-horizon climbs might be evidence for intercept-dominated progress.");
  });
});

describe("Readability dropping a real paragraph (fixture 60)", () => {
  const html = readFileSync(`${DIR}/60-www.anthropic.com.html`, "utf8");
  const r = extractPrintable(html, "https://www.anthropic.com/research/emergent-misalignment-reward-hacking", { httpStatus: 200 });

  it("uses a candidate that keeps the footnote paragraph and says why", () => {
    expect(text(r.document?.elements ?? [])).toContain("canary string to ensure this document does not enter the training corpus");
    expect(r.check.details.some((d) => /Readability left out \d+ words of whole paragraphs, so it was not used/.test(d))).toBe(true);
    expect(r.check.coverage).toBeGreaterThanOrEqual(0.99);
  });
});

describe("swarmtraces.org (fixture 189)", () => {
  const html = readFileSync(`${DIR}/189-swarmtraces.org.html`, "utf8");
  const r = extractPrintable(html, "https://swarmtraces.org/", { httpStatus: 200 });

  it("keeps the figure caption that Readability dropped", () => {
    expect(text(r.document?.elements ?? [])).toContain("Each link holds content and the URL of the next link");
  });
});

describe("paragraphWordsMissing", () => {
  it("counts a whole paragraph that is missing", () => {
    const d = doc("<div id=a><p>one two three four five six seven eight nine</p></div><div id=b><p>one two three four five six seven eight nine</p><p>alpha beta gamma delta epsilon zeta eta theta iota kappa</p></div>");
    expect(paragraphWordsMissing(d.getElementById("a")!, d.getElementById("b")!)).toBe(10);
  });

  it("treats a paragraph split at <br><br> as kept, and ignores short lines", () => {
    const d = doc("<div id=a><p>It was time to scale up.</p><p>Over the first half of the year runs grew.</p></div><div id=b><p>It was time to scale up. <br><br>Over the first half of the year runs grew.</p><p>Share this</p></div>");
    expect(paragraphWordsMissing(d.getElementById("a")!, d.getElementById("b")!)).toBe(0);
  });
});

describe("stripNamedBoilerplate", () => {
  const html =
    "<div id=r><div class='markdown-body comment-enabled'><h2>Title</h2><p>" +
    "word ".repeat(200) +
    "</p><div class='comments'>a reader comment here</div></div></div>";

  it("keeps a content wrapper that holds most of the text when asked (Readability output)", () => {
    const root = doc(html).getElementById("r")!;
    stripNamedBoilerplate(root, { keepMajority: true });
    expect(root.textContent).toContain("word word");
    expect(root.textContent).not.toContain("a reader comment");
  });

  it("without keepMajority a 'comment' wrapper goes (page-level rules unchanged)", () => {
    const root = doc(html).getElementById("r")!;
    stripNamedBoilerplate(root);
    expect(root.textContent).not.toContain("word word");
  });
});

describe("isScholarlyLanding", () => {
  it("needs more than a citation title", () => {
    expect(isScholarlyLanding(doc('<head><meta name="citation_title" content="A post"><meta name="citation_author" content="Someone"></head>'))).toBe(false);
  });
  it("is true with a PDF link or a venue/DOI", () => {
    expect(isScholarlyLanding(doc('<head><meta name="citation_pdf_url" content="https://x.org/a.pdf"></head>'))).toBe(true);
    expect(isScholarlyLanding(doc('<head><meta name="citation_title" content="T"><meta name="citation_doi" content="10.1/x"></head>'))).toBe(true);
    expect(isScholarlyLanding(doc('<head><meta name="citation_title" content="T"><meta name="citation_journal_title" content="J"></head>'))).toBe(true);
  });
});

describe("metaContent / metaAll (no selector queries)", () => {
  const d = doc(
    '<head><meta name="og:title" content="by name"><meta property="og:title" content="by property">' +
      '<meta itemprop="headline" content="by itemprop"><meta name="citation_author" content="A">' +
      '<meta property="citation_author" content="B"><meta name="empty" content="  "></head>',
  );
  it("prefers property, then name, then itemprop, per key in order", () => {
    expect(metaContent(d, "og:title")).toBe("by property");
    expect(metaContent(d, "missing", "headline")).toBe("by itemprop");
    expect(metaContent(d, "empty", "og:title")).toBe("by property");
    expect(metaContent(d, "missing")).toBe("");
  });
  it("metaAll returns name and property matches in document order", () => {
    expect(metaAll(d, "citation_author")).toEqual(["A", "B"]);
  });
});

describe("arXiv HTML paper (fixture 55)", () => {
  const html = readFileSync(`${DIR}/55-arxiv.org-html.html`, "utf8");
  const r = extractPrintable(html, "https://arxiv.org/html/2401.05566v3", { httpStatus: 200, source: "arxiv-html" });

  it("prints the diagram that sits inside an equation table", () => {
    const srcs = (r.document?.elements ?? []).flatMap((e) => (e.type === "image" ? [e.src] : []));
    expect(srcs.some((s) => s.endsWith("/2401.05566v3/deception_mdp.svg"))).toBe(true);
    expect(r.check.imagesKept).toBe(r.check.imagesFound);
    expect(r.status).toBe("ok");
  });

  it("takes the date from the arXiv corner note", () => {
    expect(r.document?.date).toBe("2024-01-17");
  });
});

describe("arxivWatermarkDate", () => {
  it("reads the version date, or nothing", () => {
    expect(arxivWatermarkDate(doc('<div id="watermark-tr">\narXiv:1706.03762v7 [cs.CL] 02 Aug 2023</div>'))).toBe("2023-08-02");
    expect(arxivWatermarkDate(doc('<div id="watermark-tr"> </div>'))).toBe("");
    expect(arxivWatermarkDate(doc("<p>no note</p>"))).toBe("");
  });
});

describe("Substack embedded post card (fixture 175)", () => {
  const html = readFileSync(`${DIR}/175-www.interconnects.ai.html`, "utf8");
  const r = extractPrintable(html, "https://www.interconnects.ai/p/when-will-average-people-feel-ais", { httpStatus: 200 });

  it("prints the card as one embed link and does not claim a missing image", () => {
    expect(r.warnings.map((w) => w.code)).not.toContain("images-missing");
    expect(r.check.imagesKept).toBe(r.check.imagesFound);
    expect(r.document?.elements.some((e) => e.type === "embed" && e.provider === "substack")).toBe(true);
  });
});

describe("images inside an embed card", () => {
  it("are not reported as missing images (the embed placeholder covers them)", () => {
    const html =
      "<html><body><article><h1>T</h1><p>" +
      "word ".repeat(120) +
      '</p><div class="embedded-post-wrap" data-attrs=\'{"url":"https://x.substack.com/p/y","title":"Y"}\'><img src="https://substackcdn.com/logo.png"><a href="https://x.substack.com/p/y">Y</a></div><p>' +
      "more ".repeat(60) +
      "</p></article></body></html>";
    const r = extractPrintable(html, "https://example.com/post", { httpStatus: 200 });
    expect(r.check.imagesFound).toBe(0);
    expect(r.warnings.map((w) => w.code)).not.toContain("images-missing");
    expect(r.document?.elements.some((e) => e.type === "embed" && e.url === "https://x.substack.com/p/y")).toBe(true);
  });
});

describe("too-short messages fit the reason", () => {
  it("landing page with much less text than the reading time (fixture 13)", () => {
    const html = readFileSync(`${DIR}/13-intelligence-curse.ai.html`, "utf8");
    const r = extractPrintable(html, "https://intelligence-curse.ai/", { httpStatus: 200, expectedMinutes: 140 });
    expect(r.status).toBe("too-short");
    expect(r.message).toBe("This page has only a part of the piece. Open the source to read all of it.");
  });

  it("paper landing page (fixtures 15 and 74)", () => {
    for (const [f, u] of [
      ["15-papers.nips.cc.html", "https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html"],
      ["74-www.nber.org.html", "https://www.nber.org/papers/w32487"],
    ]) {
      const r = extractPrintable(readFileSync(`${DIR}/${f}`, "utf8"), u, { httpStatus: 200 });
      expect(r.status).toBe("too-short");
      expect(r.message).toBe("This page has only the summary of a paper. Open the source to find the full text.");
    }
  });
});

describe("text inside an svg <foreignObject> (arXiv picture boxes, fixture 182)", () => {
  const html = readFileSync(`${DIR}/182-arxiv.org-html.html`, "utf8");
  const r = extractPrintable(html, "https://arxiv.org/html/2510.03215", { httpStatus: 200, source: "arxiv-html" });
  const printed = text(r.document?.elements ?? []);

  it("prints the boxed prompts", () => {
    expect(printed).toContain("Text 1. Prompt for Non-CoT Evaluation");
    expect(printed).toContain("Accurately answer the following question:");
    expect(printed).toContain("Let’s think step by step");
  });

  it("counts them on both sides of the check (found, printed, page)", () => {
    // Before the fix: 12,530 words printed, the ~1,200 words in the boxes were invisible to the check.
    expect(r.check.wordsPrinted).toBeGreaterThan(13_500);
    expect(r.check.withinTolerance).toBe(true);
    expect(r.check.coverage).toBeGreaterThan(0.99);
    expect(r.status).toBe("ok");
  });
});

describe("visibleText and svg", () => {
  it("reads HTML in <foreignObject> but not drawing labels", () => {
    const d = doc(
      '<div id=x><p>before</p><svg><text>label words</text><foreignObject><div><span class="ltx_p">box text here</span></div></foreignObject></svg><p>after</p></div>',
    );
    const x = d.getElementById("x")!;
    expect(visibleText(x).replace(/\s+/g, " ").trim()).toBe("before box text here after");
    expect(countNodeWords(x)).toBe(5);
    expect(foreignObjectsOf(x.querySelector("svg")!)).toHaveLength(1);
  });
});
