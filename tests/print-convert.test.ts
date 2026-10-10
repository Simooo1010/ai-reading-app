import { describe, expect, it } from "vitest";
import { convertContent, detectEmbedProvider } from "@/lib/print/convert";
import { parseDocument } from "@/lib/print/dom";
import { computeCheck } from "@/lib/print/fidelity";
import { placeholderText, type PrintElement } from "@/lib/print/types";

const URL_ = "https://example.com/blog/post";

function convert(body: string, widgetSelectors: string[] = []) {
  const dom = parseDocument(`<!doctype html><html><body><main id="c">${body}</main></body></html>`, URL_);
  const node = dom.window.document.getElementById("c")!;
  const res = convertContent(node, { baseUrl: URL_, widgetSelectors });
  const check = computeCheck({ wordsFound: res.wordsFound, wordsPage: res.wordsFound, elements: res.elements, report: res.report });
  return { ...res, check };
}

function types(els: PrintElement[]) {
  return els.map((e) => e.type);
}

describe("paragraph structure (never merged)", () => {
  it("keeps consecutive short paragraphs, poem lines and dialogue exactly", () => {
    const body = `
      <p>Yes.</p><p>No.</p><p>Maybe.</p>
      <p>The woods are lovely, dark and deep,</p>
      <p>But I have promises to keep,</p>
      <p>And miles to go before I sleep.</p>
      <p>— Are you coming?</p>
      <p>— In a minute.</p>
      <p>   </p><p><br></p><p></p>
      <p>Last.</p>`;
    const { elements, check } = convert(body);
    const paras = elements.filter((e) => e.type === "paragraph");
    // 9 non-empty <p>; the 3 empty ones are skipped.
    expect(paras).toHaveLength(9);
    expect(paras.map((p) => (p.type === "paragraph" ? p.html : ""))).toEqual([
      "Yes.",
      "No.",
      "Maybe.",
      "The woods are lovely, dark and deep,",
      "But I have promises to keep,",
      "And miles to go before I sleep.",
      "— Are you coming?",
      "— In a minute.",
      "Last.",
    ]);
    expect(check.withinTolerance).toBe(true);
    expect(check.wordsPrinted).toBe(check.wordsFound);
  });

  it("wraps loose text in a container as its own paragraph (from: text), keeping order", () => {
    const { elements } = convert(`<div>Intro text <em>here</em><p>Real para</p>tail words</div>`);
    expect(elements).toEqual([
      { type: "paragraph", html: "Intro text <em>here</em>", from: "text" },
      { type: "paragraph", html: "Real para" },
      { type: "paragraph", html: "tail words", from: "text" },
    ]);
  });
});

describe("headings", () => {
  it("keep inline links and formatting", () => {
    const { elements } = convert(`<h2>See <a href="/x">the <em>docs</em></a> now</h2><h4><strong>Bold</strong> head</h4>`);
    expect(elements[0]).toEqual({
      type: "heading",
      level: 2,
      html: `See <a href="https://example.com/x" rel="noopener noreferrer">the <em>docs</em></a> now`,
    });
    expect(elements[1]).toEqual({ type: "heading", level: 4, html: "<strong>Bold</strong> head" });
  });

  it("drop Substack anchor buttons inside headings", () => {
    const { elements } = convert(
      `<h3 class="header-anchor-post">Title<div class="pencraft header-anchor"><button aria-label="Link"><svg><path d="M0"></path></svg></button></div></h3>`,
    );
    expect(elements).toEqual([{ type: "heading", level: 3, html: "Title" }]);
  });
});

describe("lists, tables, code", () => {
  it("nested lists stay inside their item as sanitized HTML", () => {
    const { elements, check } = convert(`<ol start="3"><li>One<ul><li>One a</li><li>One b</li></ul></li><li>Two</li></ol>`);
    expect(elements).toEqual([
      { type: "list", ordered: true, start: 3, items: ["One<ul><li>One a</li><li>One b</li></ul>", "Two"] },
    ]);
    expect(check.withinTolerance).toBe(true);
  });

  it("tables are kept (sanitized) and counted", () => {
    const { elements, check } = convert(
      `<table class="x" style="color:red"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td onclick="x()">1</td><td><a href="/r">r</a></td></tr></tbody></table>`,
    );
    expect(elements).toHaveLength(1);
    const t = elements[0];
    expect(t.type).toBe("table");
    if (t.type === "table") {
      expect(t.html).toContain("<th>A</th>");
      expect(t.html).toContain(`<a href="https://example.com/r" rel="noopener noreferrer">r</a>`);
      expect(t.html).not.toMatch(/onclick|style|class/);
    }
    expect(check.tablesFound).toBe(1);
    expect(check.tablesKept).toBe(1);
  });

  it("layout tables are walked, empty spacing tables are skipped", () => {
    const { elements, check } = convert(
      `<table><tr><td><h2>Section</h2><p>Body text.</p></td></tr></table><table><tr><td><span></span></td></tr></table>`,
    );
    expect(types(elements)).toEqual(["heading", "paragraph"]);
    expect(check.tablesFound).toBe(0);
  });

  it("pre -> code with language from language-xxx", () => {
    const { elements, check } = convert(`<pre><code class="language-python">def f():\n    return 1\n</code></pre><pre>plain</pre>`);
    expect(elements).toEqual([
      { type: "code", language: "python", text: "def f():\n    return 1" },
      { type: "code", language: "", text: "plain" },
    ]);
    expect(check.codeFound).toBe(2);
    expect(check.codeKept).toBe(2);
  });
});

describe("images", () => {
  it("figure with srcset (commas in URLs), caption and alt", () => {
    const ss =
      "https://substackcdn.com/image/fetch/w_424,c_limit/https%3A%2F%2Fa.png 424w, https://substackcdn.com/image/fetch/w_1456,c_limit/https%3A%2F%2Fa.png 1456w";
    const { elements, check } = convert(
      `<div class="captioned-image-container"><figure><a href="#"><picture><source srcset="${ss}"><img src="https://substackcdn.com/small.png" srcset="${ss}" alt="A chart"></picture></a><figcaption class="image-caption">The <em>chart</em>.</figcaption></figure></div>`,
    );
    expect(elements).toEqual([
      {
        type: "image",
        src: "https://substackcdn.com/image/fetch/w_1456,c_limit/https%3A%2F%2Fa.png",
        caption: "The <em>chart</em>.",
        alt: "A chart",
      },
    ]);
    expect(check.imagesFound).toBe(1);
    expect(check.imagesKept).toBe(1);
    expect(check.withinTolerance).toBe(true);
  });

  it("lazy-loaded images use data-src; tracking pixels are skipped but reported", () => {
    const { elements, check, report } = convert(
      `<p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/i/real.jpg" alt="real"></p><img src="https://t.example/p.gif" width="1" height="1">`,
    );
    expect(elements).toEqual([{ type: "image", src: "https://example.com/i/real.jpg", caption: "", alt: "real" }]);
    expect(report.imagesSkipped).toBe(1);
    expect(check.imagesFound).toBe(1);
    expect(check.details.join(" ")).toMatch(/tracking pixel/);
  });

  it("an image with no usable address becomes a visible placeholder", () => {
    const { elements, check } = convert(`<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="lost">`);
    expect(elements[0]).toMatchObject({ type: "placeholder", kind: "image" });
    expect(check.imagesKept).toBe(0);
    expect(check.imagesFound).toBe(1);
  });

  it("figure without img is walked (caption kept as a paragraph)", () => {
    const { elements } = convert(`<figure><blockquote><p>Quoted words.</p></blockquote><figcaption>Someone</figcaption></figure>`);
    expect(elements).toEqual([
      { type: "blockquote", html: "<p>Quoted words.</p>" },
      { type: "paragraph", html: "Someone", from: "figcaption" },
    ]);
  });

  it("an image inside a paragraph with text is lifted out, not lost", () => {
    const { elements, check } = convert(`<p>Before <img src="/a.png" alt="a"> after</p>`);
    expect(types(elements)).toEqual(["paragraph", "image"]);
    expect(check.imagesKept).toBe(1);
  });

  it("emoji images print as their text", () => {
    const { elements, check } = convert(`<p>Nice <img class="emoji" src="/e.svg" alt="🙂"> work</p>`);
    expect(elements).toEqual([{ type: "paragraph", html: "Nice 🙂 work" }]);
    expect(check.imagesFound).toBe(0);
  });
});

describe("embeds and placeholders", () => {
  it("YouTube / podcast iframes become embeds that print as placeholders with their URL", () => {
    const { elements, check } = convert(`
      <div class="youtube-wrap" data-attrs='{"videoId":"qTogNUV3CAI"}'><div class="youtube-inner"><iframe src="https://www.youtube-nocookie.com/embed/qTogNUV3CAI?rel=0"></iframe></div></div>
      <iframe class="spotify-wrap" src="https://open.spotify.com/embed/episode/6SWbwjYPs5WevIoCCiSByS"></iframe>
      <div class="apple-podcast-container"><iframe src="https://embed.podcasts.apple.com/us/podcast/x/id1?i=2"></iframe></div>
      <video src="/clip.mp4" poster="/p.png"><img src="/fallback.png"></video>`);
    expect(elements).toEqual([
      { type: "embed", provider: "youtube", url: "https://www.youtube.com/watch?v=qTogNUV3CAI", media: "video" },
      { type: "embed", provider: "spotify", url: "https://open.spotify.com/episode/6SWbwjYPs5WevIoCCiSByS", media: "audio" },
      { type: "embed", provider: "apple-podcasts", url: "https://podcasts.apple.com/us/podcast/x/id1?i=2", media: "audio" },
      { type: "embed", provider: "other", url: "https://example.com/clip.mp4", media: "video" },
    ]);
    expect(elements.map(placeholderText)).toEqual([
      "Video not printed: https://www.youtube.com/watch?v=qTogNUV3CAI",
      "Audio not printed: https://open.spotify.com/episode/6SWbwjYPs5WevIoCCiSByS",
      "Audio not printed: https://podcasts.apple.com/us/podcast/x/id1?i=2",
      "Video not printed: https://example.com/clip.mp4",
    ]);
    expect(check.embedsFound).toBe(4);
    expect(check.embedsPlaceholdered).toBe(4);
    expect(check.imagesFound).toBe(0); // the <img> inside <video> is fallback content
  });

  it("a tweet keeps its text under the placeholder", () => {
    const { elements, check } = convert(
      `<blockquote class="twitter-tweet"><p>Big news today</p>— Someone <a href="https://twitter.com/x/status/123">March 1</a></blockquote>`,
    );
    expect(elements[0]).toMatchObject({ type: "embed", provider: "twitter", url: "https://twitter.com/x/status/123" });
    expect(check.withinTolerance).toBe(true);
  });

  it("an unknown element with text becomes an 'unsupported' placeholder, counted as loss", () => {
    const { elements, check } = convert(`<p>Kept.</p><marquee>Moving words here</marquee>`);
    expect(elements[1]).toMatchObject({ type: "placeholder", kind: "unsupported", words: 3 });
    expect(check.skippedUnsupported).toBe(1);
    expect(check.withinTolerance).toBe(false);
    expect(check.wordsPrinted).toBe(1);
    expect(check.wordsFound).toBe(4);
  });

  it("widgets are removed on purpose and counted, not as loss", () => {
    const { elements, check } = convert(
      `<p>Real text.</p><div class="subscription-widget-wrap"><p>Subscribe to my newsletter</p><form><input type="email"><button>Subscribe</button></form></div>`,
      [".subscription-widget-wrap"],
    );
    expect(elements).toEqual([{ type: "paragraph", html: "Real text." }]);
    expect(check.widgetsRemoved).toBe(1);
    expect(check.widgetWords).toBe(4);
    expect(check.withinTolerance).toBe(true);
  });

  it("hidden parts are skipped and reported", () => {
    const { elements, check } = convert(`<p>Shown.</p><div style="display: none"><p>Secret words</p></div><dialog><p>Pop up</p></dialog>`);
    expect(elements).toEqual([{ type: "paragraph", html: "Shown." }]);
    expect(check.wordsHidden).toBe(4);
  });

  it("detects providers by host, not by substring", () => {
    expect(detectEmbedProvider("https://www.youtube.com/embed/abc")).toBe("youtube");
    expect(detectEmbedProvider("https://youtu.be/abc")).toBe("youtube");
    expect(detectEmbedProvider("https://x.com/a/status/1")).toBe("twitter");
    expect(detectEmbedProvider("https://box.com/x")).toBe("other");
    expect(detectEmbedProvider("https://player.vimeo.com/video/1")).toBe("vimeo");
    expect(detectEmbedProvider("https://w.soundcloud.com/player")).toBe("soundcloud");
    expect(detectEmbedProvider("https://foo.substack.com/embed")).toBe("substack");
    expect(detectEmbedProvider("not a url")).toBe("other");
  });

  it("Substack footnotes keep their number with the text", () => {
    const { elements, check } = convert(
      `<div class="footnote"><a class="footnote-number" href="#footnote-anchor-1">1</a><div class="footnote-content"><p>First note.</p><p>Second para.</p></div></div>`,
    );
    expect(elements).toEqual([
      { type: "paragraph", html: "<sup>1</sup> First note." },
      { type: "paragraph", html: "Second para." },
    ]);
    expect(check.withinTolerance).toBe(true);
  });

  it("display math and LaTeXML equation tables become equation paragraphs", () => {
    const { elements } = convert(
      `<math display="block"><mi>x</mi><mo>=</mo><mn>1</mn></math><table class="ltx_equation ltx_eqn_table"><tr><td><math><mi>y</mi></math></td><td>(1)</td></tr></table>`,
    );
    expect(elements.map((e) => e.type === "paragraph" && e.from)).toEqual(["equation", "equation"]);
  });
});
