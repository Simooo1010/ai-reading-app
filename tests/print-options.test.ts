// The user's choices on the print page: nothing disappears silently.
import { describe, expect, it } from "vitest";
import { applyOptions, inlineHtmlText, isPrintableImageSrc } from "@/lib/print/options";
import type { PrintElement } from "@/lib/print/types";

const IMG_A = "https://cdn.example.com/a.png";
const IMG_B = "https://cdn.example.com/b.png";

const ELEMENTS: PrintElement[] = [
  { type: "heading", level: 2, html: "Intro" },
  { type: "paragraph", html: "One two three." },
  { type: "image", src: IMG_A, caption: "A <em>nice</em> chart &amp; more", alt: "chart" },
  { type: "embed", provider: "youtube", url: "https://www.youtube.com/watch?v=abc", media: "video" },
  { type: "embed", provider: "twitter", url: "https://x.com/a/status/1", text: "Four five six seven" },
  { type: "image", src: IMG_B, caption: "", alt: "" },
  { type: "placeholder", kind: "iframe", label: "Interactive chart not printed", url: "https://e.com/c" },
  { type: "image", src: IMG_A, caption: "", alt: "same image again" },
];
const doc = { elements: ELEMENTS };

describe("applyOptions", () => {
  it("keeps everything by default", () => {
    const r = applyOptions(doc, { excludeEmbeds: false, removedImages: new Set() });
    expect(r.elements).toEqual(ELEMENTS);
    expect(r.sourceIndex).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(r).toMatchObject({ excludedEmbeds: 0, removedImagesCount: 0, excludedWords: 0 });
  });

  it("counts every embed left out and the words in its text", () => {
    const r = applyOptions(doc, { excludeEmbeds: true, removedImages: new Set() });
    expect(r.excludedEmbeds).toBe(2);
    expect(r.excludedWords).toBe(4); // "Four five six seven"
    expect(r.elements.some((e) => e.type === "embed")).toBe(false);
    expect(r.sourceIndex).toEqual([0, 1, 2, 5, 6, 7]);
  });

  it("placeholders are never 'embeds the user left out'", () => {
    const r = applyOptions(doc, { excludeEmbeds: true, removedImages: new Set() });
    expect(r.elements.filter((e) => e.type === "placeholder")).toHaveLength(1);
  });

  it("removes images by src, counts each removed element and its caption words", () => {
    const r = applyOptions(doc, { excludeEmbeds: false, removedImages: new Set([IMG_A]) });
    expect(r.removedImagesCount).toBe(2); // the same picture twice
    expect(r.excludedWords).toBe(4); // caption "A nice chart & more": A, nice, chart, more
  });

  it("both options together", () => {
    const r = applyOptions(doc, { excludeEmbeds: true, removedImages: new Set([IMG_B]) });
    expect(r.excludedEmbeds).toBe(2);
    expect(r.removedImagesCount).toBe(1);
    expect(r.elements.map((e) => e.type)).toEqual(["heading", "paragraph", "image", "placeholder", "image"]);
  });

  it("works without a document", () => {
    expect(applyOptions(undefined, { excludeEmbeds: true, removedImages: new Set() }).elements).toEqual([]);
    expect(applyOptions(null, { excludeEmbeds: false, removedImages: new Set() }).sourceIndex).toEqual([]);
  });
});

describe("inlineHtmlText", () => {
  it("drops inline tags without splitting words", () => {
    expect(inlineHtmlText("foo<em>bar</em> baz")).toBe("foobar baz");
  });
  it("turns <br> and MathML cells into spaces", () => {
    expect(inlineHtmlText("a<br>b<br/>c")).toBe("a b c");
    expect(inlineHtmlText("<mtable><mtr><mtd>x</mtd><mtd>y</mtd></mtr></mtable>").trim().split(/\s+/)).toEqual(["x", "y"]);
  });
  it("decodes entities", () => {
    expect(inlineHtmlText("A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x41;&nbsp;z")).toBe("A & B <c> \"d\" 'e' A z");
    expect(inlineHtmlText("&unknown;")).toBe("&unknown;");
    expect(inlineHtmlText("")).toBe("");
  });
});

describe("isPrintableImageSrc", () => {
  it("accepts https and raster data: URLs only", () => {
    expect(isPrintableImageSrc("https://a.com/x.png")).toBe(true);
    expect(isPrintableImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isPrintableImageSrc("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
  });
  it("refuses everything else", () => {
    expect(isPrintableImageSrc("http://a.com/x.png")).toBe(false);
    expect(isPrintableImageSrc("javascript:alert(1)")).toBe(false);
    expect(isPrintableImageSrc("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isPrintableImageSrc("data:text/html;base64,PGI+")).toBe(false);
    expect(isPrintableImageSrc("/relative.png")).toBe(false);
    expect(isPrintableImageSrc("")).toBe(false);
    expect(isPrintableImageSrc(undefined)).toBe(false);
    expect(isPrintableImageSrc("data:image/png;base64,<script>")).toBe(false);
  });
});
