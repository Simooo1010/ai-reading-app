import { describe, expect, it } from "vitest";
import {
  bestFromSrcset,
  isTrackingPixel,
  parseSrcset,
  pickImageSrc,
  resolveUrl,
  sanitizeBlock,
  sanitizeInline,
} from "@/lib/print/sanitize";

const BASE = "https://example.com/posts/one";

/** Nothing executable may survive. */
function expectInert(out: string) {
  expect(out).not.toMatch(/<script/i);
  expect(out).not.toMatch(/<iframe/i);
  expect(out).not.toMatch(/<style/i);
  expect(out).not.toMatch(/<form/i);
  expect(out).not.toMatch(/<base/i);
  expect(out).not.toMatch(/<meta/i);
  expect(out).not.toMatch(/<svg/i);
  expect(out).not.toMatch(/<object/i);
  expect(out).not.toMatch(/<embed/i);
  expect(out).not.toMatch(/\son[a-z]+\s*=/i);
  expect(out).not.toMatch(/javascript:/i);
  expect(out).not.toMatch(/vbscript:/i);
  expect(out).not.toMatch(/data:/i);
  expect(out).not.toMatch(/srcdoc/i);
  expect(out).not.toMatch(/\sstyle\s*=/i);
}

const HOSTILE = [
  `<img src=x onerror="alert(1)">`,
  `<img src="https://ok.example/a.png" onload=alert(1)>`,
  `<a href="javascript:alert(1)">x</a>`,
  `<a href="JaVaScRiPt:alert(1)">x</a>`,
  `<a href="jav&#x09;ascript:alert(1)">x</a>`,
  `<a href="  javascript:alert(1)">x</a>`,
  `<a href="vbscript:msgbox(1)">x</a>`,
  `<a href="data:text/html,<script>alert(1)</script>">x</a>`,
  `<svg onload=alert(1)><circle r=5></circle></svg>`,
  `<svg><script>alert(1)</script></svg>`,
  `<style>body{display:none}</style><p>text</p>`,
  `<p style="background:url(javascript:alert(1))">styled</p>`,
  `<scr<script>ipt>alert(1)</scr</script>ipt>`,
  `<<script>script>alert(1)<</script>/script>`,
  `<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
  `<iframe src="https://evil.example/"></iframe>`,
  `<base href="https://evil.example/"><a href="/x">rel</a>`,
  `<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`,
  `<form action="https://evil.example/steal"><input name="pw"><button>Go</button></form>`,
  `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`,
  `<math href="javascript:alert(1)"><mi>x</mi></math>`,
  `<object data="javascript:alert(1)"></object><embed src="javascript:alert(1)">`,
  `<a href="https://ok.example" onclick="alert(1)" target="_blank">link</a>`,
  `<div id="x" class="evil" onmouseover="alert(1)">hover</div>`,
  `<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">`,
  `<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>`,
  `<textarea><img src=x onerror=alert(1)></textarea>`,
  `<template><img src=x onerror=alert(1)></template>`,
  `<a href="https://ok.example/"><img src=x onerror=alert(1)//</a>`,
  `<img srcset="javascript:alert(1) 1x">`,
  `<video src=x onerror=alert(1)></video><audio src=x onerror=alert(1)></audio>`,
  `<details open ontoggle=alert(1)>t</details>`,
  `<p>ok</p><!--<img src=x onerror=alert(1)>-->`,
];

describe("sanitizeBlock / sanitizeInline with hostile input", () => {
  for (const h of HOSTILE) {
    it(`neutralizes ${h.slice(0, 60)}`, () => {
      expectInert(sanitizeBlock(h, BASE));
      expectInert(sanitizeInline(h, BASE));
    });
  }

  it("keeps safe links, adds rel and resolves relative URLs", () => {
    const out = sanitizeInline(`<a href="/about" target="_blank">About</a> <a href="mailto:a@b.c">mail</a>`, BASE);
    expect(out).toContain(`href="https://example.com/about"`);
    expect(out).toContain(`rel="noopener noreferrer"`);
    expect(out).toContain(`href="mailto:a@b.c"`);
    expect(out).not.toContain("target");
  });

  it("drops a <base> tag: relative links resolve against the page URL, not the attacker's base", () => {
    const out = sanitizeBlock(`<base href="https://evil.example/"><a href="x">x</a>`, BASE);
    expect(out).toContain(`href="https://example.com/posts/x"`);
  });

  it("keeps inline formatting but no ids, classes or styles", () => {
    const out = sanitizeInline(
      `<strong id="a" class="b" style="color:red">bold</strong> <em>it</em> <code class="language-js">x</code> <sup>1</sup>`,
      BASE,
    );
    expect(out).toBe(`<strong>bold</strong> <em>it</em> <code class="language-js">x</code> <sup>1</sup>`);
  });

  it("sanitizeInline removes block tags and images but keeps their text", () => {
    const out = sanitizeInline(`<div><p>one</p><img src="https://a.example/i.png"><ul><li>two</li></ul></div>`, BASE);
    expect(out).not.toMatch(/<(div|p|ul|li|img)/);
    expect(out).toContain("one");
    expect(out).toContain("two");
  });

  it("sanitizeBlock keeps lists, tables and images with absolute https src", () => {
    const out = sanitizeBlock(
      `<ul><li>a<ul><li>b</li></ul></li></ul><table><tr><td colspan="2" onclick="x">c</td></tr></table><img src="//cdn.example/i.png" alt="A">`,
      BASE,
    );
    expect(out).toContain("<ul><li>a<ul><li>b</li></ul></li></ul>");
    expect(out).toContain(`<td colspan="2">c</td>`);
    expect(out).toContain(`<img src="https://cdn.example/i.png" alt="A" />`);
  });

  it("drops tracking pixels and images without a usable address", () => {
    expect(sanitizeBlock(`<img src="https://t.example/p.gif" width="1" height="1">`, BASE)).toBe("");
    expect(sanitizeBlock(`<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`, BASE)).toBe("");
  });

  it("keeps MathML (presentation) without links", () => {
    const out = sanitizeInline(
      `<math alttext="x^2" display="inline"><semantics><msup><mi>x</mi><mn>2</mn></msup><annotation encoding="application/x-tex">x^2</annotation></semantics></math>`,
      BASE,
    );
    expect(out).toContain("<math");
    expect(out).toContain("<msup><mi>x</mi><mn>2</mn></msup>");
    expect(out).not.toContain("annotation");
  });
});

describe("srcset and image source choice", () => {
  it("parses Substack srcsets whose URLs contain commas", () => {
    const ss =
      "https://substackcdn.com/image/fetch/$s_!a!,w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fx.png 424w, " +
      "https://substackcdn.com/image/fetch/$s_!a!,w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fx.png 1456w, " +
      "https://substackcdn.com/image/fetch/$s_!a!,w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fx.png 848w";
    const c = parseSrcset(ss);
    expect(c).toHaveLength(3);
    expect(c[1].url).toContain("w_1456,c_limit,f_webp");
    expect(bestFromSrcset(ss)).toContain("w_1456,c_limit");
  });

  it("handles density descriptors and no descriptors", () => {
    expect(bestFromSrcset("a.png 1x, b.png 2x")).toBe("b.png");
    expect(bestFromSrcset("only.png")).toBe("only.png");
    expect(parseSrcset("a.png, b.png 2x").map((c) => c.url)).toEqual(["a.png", "b.png"]);
  });

  it("prefers lazy-load attributes over a data: stub and upgrades http", () => {
    expect(
      pickImageSrc({ src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", "data-src": "/img/real.jpg" }, BASE),
    ).toBe("https://example.com/img/real.jpg");
    expect(pickImageSrc({ src: "http://example.org/a.jpg" }, BASE)).toBe("https://example.org/a.jpg");
    expect(pickImageSrc({ src: "javascript:alert(1)" }, BASE)).toBe("");
  });

  it("detects tracking pixels by declared size", () => {
    expect(isTrackingPixel({ width: "1", height: "1" })).toBe(true);
    expect(isTrackingPixel({ width: "600", height: "1" })).toBe(false);
    expect(isTrackingPixel({})).toBe(false);
  });

  it("resolveUrl only returns http(s)", () => {
    expect(resolveUrl("../a", "https://x.example/b/c")).toBe("https://x.example/a");
    expect(resolveUrl("javascript:alert(1)", BASE)).toBe("");
    expect(resolveUrl("file:///etc/passwd", BASE)).toBe("");
    expect(resolveUrl("mailto:a@b.c", BASE)).toBe("");
    expect(resolveUrl("mailto:a@b.c", BASE, true)).toBe("mailto:a@b.c");
  });
});
