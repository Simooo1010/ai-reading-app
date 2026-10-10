import { describe, expect, it } from "vitest";
import { extractPrintable } from "@/lib/print/extract";
import { countWords, detectBotChallenge, emptyCheck, formatCheckLine, formatNumber } from "@/lib/print/fidelity";
import { isArxivAbsUrl, isArxivHtmlUrl } from "@/lib/print/generic";
import { normalizeDate } from "@/lib/print/meta";
import { isSubstackNoteUrl } from "@/lib/print/substack";
import type { FidelityCheck } from "@/lib/print/types";

function check(over: Partial<FidelityCheck>): FidelityCheck {
  return { ...emptyCheck(), withinTolerance: true, ratio: 1, ...over };
}

describe("countWords", () => {
  it("counts words with apostrophes, hyphens and numbers as one", () => {
    expect(countWords("Don't stop the state-of-the-art model in 2025.")).toBe(7);
    expect(countWords("It’s 3.5 times — really!")).toBe(5); // "3.5" is two tokens on both sides
    expect(countWords("")).toBe(0);
    expect(countWords("   — … !!! ")).toBe(0);
  });

  it("is Unicode-aware (accents, Cyrillic, CJK characters one each)", () => {
    expect(countWords("Łukasz Kaiser café naïve")).toBe(4);
    expect(countWords("привет мир")).toBe(2);
    expect(countWords("人工智能")).toBe(4);
    expect(countWords("AI 人工 test")).toBe(4);
  });

  it("is fast on a huge input (no backtracking)", () => {
    const big = "a-".repeat(500_000) + "!";
    const t = Date.now();
    expect(countWords(big)).toBe(1);
    expect(Date.now() - t).toBeLessThan(2000);
  });
});

describe("formatCheckLine", () => {
  it("formats the line from the spec", () => {
    const line = formatCheckLine(
      check({ wordsFound: 8651, wordsPrinted: 8640, ratio: 8640 / 8651, imagesFound: 11, imagesKept: 11 }),
    );
    expect(line).toBe("Words: 8,651 found, 8,640 printed. Images: 11 of 11. Tables: 0 of 0. Check passed.");
  });

  it("never says the check passed when it failed", () => {
    for (const ratio of [0.5, 0.97, 1.03, 2]) {
      const line = formatCheckLine(check({ wordsFound: 1000, wordsPrinted: Math.round(1000 * ratio), ratio, withinTolerance: false }));
      expect(line).toMatch(/Check failed/);
      expect(line).not.toMatch(/Check passed/);
    }
    expect(formatCheckLine(check({ wordsFound: 0, wordsPrinted: 0, ratio: 0, withinTolerance: false }))).toMatch(
      /Check failed: we found no text/,
    );
  });

  it("does not claim a full pass when images, tables or code are missing", () => {
    const line = formatCheckLine(check({ wordsFound: 10, wordsPrinted: 10, imagesFound: 3, imagesKept: 2 }));
    expect(line).not.toMatch(/Check passed/);
    expect(line).toMatch(/some images, tables or code blocks are missing/);
  });

  it("mentions embeds, code, unsupported parts, hidden words and low coverage", () => {
    const line = formatCheckLine(
      check({
        wordsFound: 100,
        wordsPrinted: 100,
        codeFound: 4,
        codeKept: 4,
        embedsPlaceholdered: 2,
        skippedUnsupported: 1,
        wordsHidden: 250,
        wordsPage: 400,
        coverage: 0.25,
      }),
    );
    expect(line).toContain("Code blocks: 4 of 4.");
    expect(line).toContain("2 videos or embeds are shown as links.");
    expect(line).toContain("1 part of the page could not be printed and is marked in the text.");
    expect(line).toContain("250 words in collapsed or hidden parts of the page are not printed.");
    expect(line).toContain("We may have missed part of this page: the printout has 25% of the page text.");
  });

  it("formatNumber uses fixed thousands separators", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});

describe("bot challenge detection", () => {
  it("flags challenge titles and markers only on small pages", () => {
    expect(detectBotChallenge("<html></html>", "Just a moment...", 3)).toBe(true);
    expect(detectBotChallenge("<html></html>", "Attention Required! | Cloudflare", 40)).toBe(true);
    expect(detectBotChallenge(`<div class="g-recaptcha"></div><p>Please complete the security check</p>`, "Example", 20)).toBe(true);
    // A real article that ships Cloudflare scripts is not a challenge.
    expect(detectBotChallenge(`<script src="/cdn-cgi/challenge-platform/x.js"></script>captcha`, "My post", 2000)).toBe(false);
    expect(detectBotChallenge("<p>hello</p>", "Short note", 20)).toBe(false);
  });
});

describe("extractPrintable routing and status hints", () => {
  const article = `<!doctype html><html><head><title>A real post</title></head><body><article><h1>A real post</h1>${Array.from(
    { length: 12 },
    (_, i) => `<p>Paragraph ${i} has a handful of ordinary words so the page is not too short at all.</p>`,
  ).join("")}</article></body></html>`;

  it("works on a simple article", () => {
    const r = extractPrintable(article, "https://example.com/a");
    expect(r.status).toBe("ok");
    expect(r.document?.title).toBe("A real post");
    expect(r.document?.publication).toBe("example.com");
  });

  it("maps HTTP status hints", () => {
    expect(extractPrintable(article, "https://example.com/a", { httpStatus: 401 })).toMatchObject({
      status: "blocked",
      message: "This page needs a login. Open the source instead.",
    });
    expect(extractPrintable(article, "https://example.com/a", { httpStatus: 403 }).status).toBe("blocked");
    expect(extractPrintable(article, "https://example.com/a", { httpStatus: 429 }).status).toBe("blocked");
    expect(extractPrintable(article, "https://example.com/a", { httpStatus: 402 }).status).toBe("paywalled");
  });

  it("never throws on malformed or odd input", () => {
    expect(extractPrintable("", "https://example.com/").status).toBe("failed");
    expect(extractPrintable("<<<>>>\u0000<p", "https://example.com/").status).toMatch(/failed|too-short/);
    expect(extractPrintable(article, "not a url").status).toBe("failed");
    expect(extractPrintable(article, "javascript:alert(1)").status).toBe("failed");
    // Extreme nesting is refused before parsing (fast), moderate nesting still works.
    const deep = "<div>".repeat(200_000) + "text" + "</div>".repeat(200_000);
    const t = Date.now();
    expect(extractPrintable(deep, "https://example.com/").status).toBe("failed");
    expect(Date.now() - t).toBeLessThan(2000);
    const mid = "<div>".repeat(500) + "word ".repeat(300) + "</div>".repeat(500);
    expect(extractPrintable(mid, "https://example.com/").status).toBe("ok");
    // @ts-expect-error wrong type on purpose
    expect(extractPrintable(null, "https://example.com/").status).toBe("failed");
  }, 30_000);

  it("Substack Notes are reported as unsupported", () => {
    const r = extractPrintable(article, "https://substack.com/@someone/note/c-123456");
    expect(r.status).toBe("failed");
    expect(r.message).toMatch(/Substack Notes/);
    expect(isSubstackNoteUrl("https://www.example.com/note/c-99")).toBe(true);
    expect(isSubstackNoteUrl("https://example.com/note/some-blog-note")).toBe(false);
    expect(isSubstackNoteUrl("https://foo.substack.com/p/a-post")).toBe(false);
  });

  it("generic paywall: JSON-LD isAccessibleForFree=false", () => {
    const paid = article.replace(
      "</head>",
      `<script type="application/ld+json">{"@type":"NewsArticle","headline":"A real post","isAccessibleForFree":"False"}</script></head>`,
    );
    const r = extractPrintable(paid, "https://news.example/a");
    expect(r.status).toBe("paywalled");
    expect(r.document).toBeDefined();
  });

  it("does not run scripts or load resources", () => {
    const html = `<html><body><script>globalThis.__pwned = true;</script><img src="https://example.invalid/x.png" onerror="globalThis.__pwned2 = true"><p>${"word ".repeat(200)}</p></body></html>`;
    extractPrintable(html, "https://example.com/");
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
    expect((globalThis as Record<string, unknown>).__pwned2).toBeUndefined();
  });
});

describe("helpers", () => {
  it("arXiv URL kinds", () => {
    expect(isArxivHtmlUrl("https://arxiv.org/html/1706.03762")).toBe(true);
    expect(isArxivAbsUrl("https://arxiv.org/abs/1706.03762")).toBe(true);
    expect(isArxivAbsUrl("https://notarxiv.org/abs/1")).toBe(false);
  });

  it("normalizeDate", () => {
    expect(normalizeDate("2020/05/08")).toBe("2020-05-08");
    expect(normalizeDate("2025-02-13T04:55:12+00:00")).toBe("2025-02-13T04:55:12.000Z");
    expect(normalizeDate("not a date")).toBe("");
    expect(normalizeDate("")).toBe("");
  });
});
