import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractPrintable } from "@/lib/print/extract";
import type { PrintDocument } from "@/lib/print/types";
import { packBatches } from "@/lib/print/translate/batch";
import { isSaneLength, maskHtml, unmaskHtml } from "@/lib/print/translate/mask";
import { applyTranslations, collectSegments, finalizeSegment } from "@/lib/print/translate/segments";

// Fixture document (tests only): one element of every type.
const DOC: PrintDocument = {
  url: "https://example.com/post",
  title: "The quiet machine",
  subtitle: "Notes on models",
  author: "Fixture Author",
  publication: "Fixture",
  date: "2026-10-01",
  elements: [
    { type: "heading", level: 2, html: "A <em>first</em> look" },
    { type: "paragraph", html: 'Read <a href="https://example.com/a" rel="noopener noreferrer">this post</a> today.' },
    { type: "paragraph", html: "<math><mi>x</mi><mo>=</mo><mn>2</mn></math>", from: "equation" },
    { type: "paragraph", html: "https://example.com/plain-link" },
    { type: "paragraph", html: "2024 — 3.5%" },
    { type: "blockquote", html: "<p>Quoted words.</p>" },
    { type: "pullquote", html: "Big idea" },
    { type: "image", src: "https://example.com/i.png", caption: "A chart", alt: "chart" },
    { type: "list", ordered: false, items: ["One item", "Two <strong>items</strong>"] },
    { type: "separator" },
    { type: "code", language: "js", text: "const answer = 42; // keep me" },
    { type: "table", html: "<table><tbody><tr><td>Cell text</td></tr></tbody></table>" },
    { type: "embed", provider: "twitter", url: "https://x.com/a/status/1", text: "A post on X" },
    { type: "placeholder", kind: "iframe", label: "Interactive content not printed", url: "https://example.com/f" },
  ],
};

const fakeItalian = (s: string) => `IT ${s}`;

describe("collectSegments", () => {
  it("takes prose and skips code, separators, placeholders, equations, URLs and strings with no letters", () => {
    const segs = collectSegments(DOC);
    const where = segs.map((s) => (s.ref.where === "element" ? `${s.ref.index}.${s.ref.key}` : s.ref.where === "item" ? `${s.ref.index}[${s.ref.item}]` : s.ref.where));
    expect(where).toEqual(["title", "subtitle", "0.html", "1.html", "5.html", "6.html", "7.caption", "8[0]", "8[1]", "11.html", "12.text"]);
    expect(segs.find((s) => s.ref.where === "title")?.kind).toBe("plain");
    expect(segs.find((s) => s.source.startsWith("<p>"))?.kind).toBe("block");
    expect(segs.find((s) => s.source === "Big idea")?.kind).toBe("inline");
  });

  it("rebuilds a deep copy with the same elements, order and types; untouched parts stay identical", () => {
    const before = structuredClone(DOC);
    const segs = collectSegments(DOC);
    const { document, translated } = applyTranslations(DOC, segs, segs.map((s) => fakeItalian(s.text)));
    expect(DOC).toEqual(before); // original not changed
    expect(translated).toBe(segs.length);
    expect(document.elements.map((e) => e.type)).toEqual(DOC.elements.map((e) => e.type));
    expect(document.title).toBe("IT The quiet machine");
    expect(document.author).toBe(DOC.author);
    expect(document.url).toBe(DOC.url);
    expect(document.elements[1]).toEqual({
      type: "paragraph",
      html: 'IT Read <a href="https://example.com/a" rel="noopener noreferrer">this post</a> today.',
    });
    expect(document.elements[2]).toEqual(DOC.elements[2]);
    expect(document.elements[3]).toEqual(DOC.elements[3]);
    expect(document.elements[4]).toEqual(DOC.elements[4]);
    expect(document.elements[9]).toEqual(DOC.elements[9]);
    expect(document.elements[10]).toEqual(DOC.elements[10]);
    expect(document.elements[13]).toEqual(DOC.elements[13]);
    expect(document.elements[8]).toEqual({ type: "list", ordered: false, items: ["IT One item", "IT Two <strong>items</strong>"] });
    expect(document.elements[7]).toMatchObject({ caption: "IT A chart", src: "https://example.com/i.png", alt: "chart" });
    expect(document.elements[12]).toMatchObject({ text: "IT A post on X", url: "https://x.com/a/status/1" });
  });

  it("keeps the English for a null or unusable answer and counts only real translations", () => {
    const segs = collectSegments(DOC);
    const answers = segs.map((s, i) => (i === 0 ? null : i === 3 ? "lost the markers" : fakeItalian(s.text)));
    const { document, translated } = applyTranslations(DOC, segs, answers);
    expect(translated).toBe(segs.length - 2);
    expect(document.title).toBe(DOC.title);
    expect(document.elements[1]).toEqual(DOC.elements[1]);
  });

  it("sanitizes translated HTML again (a script in the answer is dropped)", () => {
    const seg = collectSegments(DOC).find((s) => s.source === "Big idea")!;
    expect(finalizeSegment(seg, "Grande <script>alert(1)</script>idea", DOC.url)).toBe("Grande &lt;script&gt;alert(1)&lt;/script&gt;idea");
  });
});

describe("mask / unmask", () => {
  it("round-trips nested tags, entities, void tags and opaque math", () => {
    const html =
      'Tom &amp; Jerry <em>say <strong>"hi"</strong> &lt;3</em><br />see <a href="https://e.com/?a=1&amp;b=2">x</a> and <math><mi>a</mi><mo>&lt;</mo><mi>b</mi></math>.';
    const m = maskHtml(html);
    expect(m.text).toBe('Tom & Jerry ⟦1⟧say ⟦2⟧"hi"⟦/2⟧ <3⟦/1⟧⟦3/⟧see ⟦4⟧x⟦/4⟧ and ⟦5/⟧.');
    expect(unmaskHtml(m, m.text)).toBe(html);
  });

  it("decodes entities before and escapes text after", () => {
    const m = maskHtml("a &mdash; b &#8217;c&#x2019; &unknownthing;");
    expect(m.text).toBe("a — b ’c’ ⟦1/⟧");
    expect(unmaskHtml(m, "<b> & ⟦1/⟧")).toBe("&lt;b&gt; &amp; &unknownthing;");
  });

  it("keeps code, kbd, samp, var and svg whole", () => {
    const m = maskHtml("Run <code>npm <b>i</b></code> then <kbd>Enter</kbd>, <var>n</var>, <samp>ok</samp> <svg><text>t</text></svg>");
    expect(m.text).toBe("Run ⟦1/⟧ then ⟦2/⟧, ⟦3/⟧, ⟦4/⟧ ⟦5/⟧");
    expect(m.tags[0]).toEqual({ kind: "self", html: "<code>npm <b>i</b></code>" });
  });

  it("accepts spaces inside markers and words moved around", () => {
    const m = maskHtml("the <em>red</em> car");
    expect(unmaskHtml(m, "la macchina ⟦ 1 ⟧rossa⟦ /1 ⟧")).toBe("la macchina <em>rossa</em>");
  });

  it("rejects lost, doubled, unknown, crossed or broken markers", () => {
    const m = maskHtml("<em>a</em> <strong>b</strong><br />");
    expect(unmaskHtml(m, "⟦1⟧a⟦/1⟧ ⟦2⟧b⟦/2⟧⟦3/⟧")).not.toBeNull();
    expect(unmaskHtml(m, "⟦1⟧a⟦/1⟧ b⟦3/⟧")).toBeNull(); // lost a pair
    expect(unmaskHtml(m, "⟦1⟧a⟦/1⟧ ⟦2⟧b⟦/2⟧")).toBeNull(); // lost a void
    expect(unmaskHtml(m, "⟦1⟧a⟦/1⟧ ⟦2⟧b⟦/2⟧⟦3/⟧⟦3/⟧")).toBeNull(); // doubled
    expect(unmaskHtml(m, "⟦1⟧a⟦/1⟧ ⟦2⟧b⟦/2⟧⟦3/⟧⟦9/⟧")).toBeNull(); // unknown
    expect(unmaskHtml(m, "⟦1⟧a ⟦2⟧b⟦/1⟧⟦/2⟧⟦3/⟧")).toBeNull(); // crossed
    expect(unmaskHtml(m, "⟦1⟧a⟦/1⟧ ⟦2⟧b⟦/2⟧⟦3/")).toBeNull(); // broken
    expect(unmaskHtml(m, "⟦/1⟧a⟦1⟧ ⟦2⟧b⟦/2⟧⟦3/⟧")).toBeNull(); // close before open
  });

  it("closes unclosed tags and drops stray end tags", () => {
    const m = maskHtml("<em>a</b> b");
    expect(m.text).toBe("⟦1⟧a b⟦/1⟧");
    expect(unmaskHtml(m, m.text)).toBe("<em>a b</em>");
  });

  it("rejects empty or absurdly long answers", () => {
    expect(isSaneLength("hello", "   ")).toBe(false);
    expect(isSaneLength("hello", "ciao")).toBe(true);
    expect(isSaneLength("hello", "x".repeat(300))).toBe(false);
    const seg = collectSegments(DOC).find((s) => s.source === "Big idea")!;
    expect(finalizeSegment(seg, "", DOC.url)).toBeNull();
  });
});

describe("packBatches", () => {
  it("keeps order and respects the char and item limits; a long text goes alone", () => {
    const texts = ["a".repeat(40), "b".repeat(40), "c".repeat(200), "d", "e", "f", "g"];
    const b = packBatches(texts, { maxChars: 100, maxItems: 3 });
    expect(b).toEqual([[0, 1], [2], [3, 4, 5], [6]]);
    expect(b.flat()).toEqual(texts.map((_, i) => i));
  });

  it("uses about 6000 chars and 40 items by default", () => {
    expect(packBatches(Array.from({ length: 100 }, () => "x")).map((x) => x.length)).toEqual([40, 40, 20]);
    expect(packBatches(Array.from({ length: 4 }, () => "x".repeat(2500))).map((x) => x.length)).toEqual([2, 2]);
  });
});

describe("real saved pages (identity translator)", () => {
  // Answering each segment with its own masked text must give back exactly
  // the English HTML: masking loses nothing on real content (links, math,
  // tables, footnotes, entities).
  const PAGES: [string, string][] = [
    ["81-titotal.substack.com.html", "https://titotal.substack.com/p/a-deep-critique-of-ai-2027s-bad-timeline"],
    ["16-arxiv.org-html.html", "https://arxiv.org/html/1706.03762"],
    ["55-arxiv.org-html.html", "https://arxiv.org/html/2401.05566v3"],
    ["26-epoch.ai.html", "https://epoch.ai/publications/can-ai-scaling-continue-through-2030"],
    ["186-www.lesswrong.com.html", "https://www.lesswrong.com/posts/q5ejXr4CRuPxkgzJD/claude-opus-4-5-achieves-50-time-horizon-of-around-4-hrs-49"],
  ];
  for (const [file, url] of PAGES) {
    it(file, () => {
      const r = extractPrintable(readFileSync(`tests/fixtures/print/${file}`, "utf8"), url);
      const doc = r.document!;
      const segs = collectSegments(doc);
      expect(segs.length).toBeGreaterThan(5);
      const { document, translated } = applyTranslations(doc, segs, segs.map((s) => s.text));
      expect(translated).toBe(segs.length);
      expect(document).toEqual(doc);
      for (const s of segs) expect(s.text).not.toMatch(/href=|<\/(a|p|em|li|td)>/); // the translator never sees markup
    });
  }
});
