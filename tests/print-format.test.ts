// Text for the print page: page check, dates, PDF file names, and the
// client-safe word counter (same results as the server's).
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import * as fidelity from "@/lib/print/fidelity";
import {
  FILE_NAME_FALLBACK,
  formatCheckLine,
  formatPrintDate,
  pageCheck,
  PAGES_MISMATCH_LINE,
  pdfTitle,
  sanitizeFileName,
} from "@/lib/print/format";
import * as sanitize from "@/lib/print/sanitize";
import { countWords, NON_TEXT_TAGS, visibleText } from "@/lib/print/text";

const CHECK = {
  ...fidelity.emptyCheck(1000),
  wordsFound: 1000,
  wordsPrinted: 1000,
  imagesFound: 3,
  imagesKept: 3,
  embedsFound: 2,
  embedsPlaceholdered: 2,
  coverage: 1,
  ratio: 1,
  withinTolerance: true,
};

describe("moved helpers keep their old import paths", () => {
  it("fidelity re-exports the same functions", () => {
    expect(fidelity.countWords).toBe(countWords);
    expect(fidelity.visibleText).toBe(visibleText);
    expect(fidelity.formatCheckLine).toBe(formatCheckLine);
    expect(sanitize.NON_TEXT_TAGS).toBe(NON_TEXT_TAGS);
  });
});

describe("pageCheck", () => {
  it("passes when the pages hold the printed words", () => {
    const r = pageCheck({ check: CHECK, excludedEmbeds: 0, removedImages: 0, excludedWords: 0, wordsOnPages: 1000 });
    expect(r.checkLine).toBe(formatCheckLine(CHECK));
    expect(r.leftOut).toBeNull();
    expect(r.onPages).toBe("On the pages: 1,000 words.");
    expect(r.mismatch).toBe(false);
  });

  it("says what the user left out, and subtracts its words", () => {
    const r = pageCheck({ check: CHECK, excludedEmbeds: 2, removedImages: 1, excludedWords: 30, wordsOnPages: 970 });
    expect(r.leftOut).toBe("Left out by you: 2 embeds, 1 image.");
    expect(r.expectedWords).toBe(970);
    expect(r.mismatch).toBe(false);
    expect(pageCheck({ check: CHECK, excludedEmbeds: 1, removedImages: 3, excludedWords: 0, wordsOnPages: 1000 }).leftOut).toBe(
      "Left out by you: 1 embed, 3 images.",
    );
    expect(pageCheck({ check: CHECK, excludedEmbeds: 0, removedImages: 2, excludedWords: 0, wordsOnPages: 1000 }).leftOut).toBe(
      "Left out by you: 2 images.",
    );
  });

  it("fails above 2 % difference, in both directions", () => {
    const at = (n: number) => pageCheck({ check: CHECK, excludedEmbeds: 0, removedImages: 0, excludedWords: 0, wordsOnPages: n }).mismatch;
    expect(at(980)).toBe(false);
    expect(at(1020)).toBe(false);
    expect(at(979)).toBe(true);
    expect(at(1021)).toBe(true);
    expect(at(0)).toBe(true);
  });

  it("is pending (no line, no failure) while the pages are not ready", () => {
    const r = pageCheck({ check: CHECK, excludedEmbeds: 0, removedImages: 0, excludedWords: 0, wordsOnPages: null });
    expect(r.onPages).toBeNull();
    expect(r.mismatch).toBe(false);
  });

  it("handles an empty printout", () => {
    const empty = { ...CHECK, wordsPrinted: 0 };
    expect(pageCheck({ check: empty, excludedEmbeds: 0, removedImages: 0, excludedWords: 0, wordsOnPages: 0 }).mismatch).toBe(false);
    expect(pageCheck({ check: empty, excludedEmbeds: 0, removedImages: 0, excludedWords: 0, wordsOnPages: 3 }).mismatch).toBe(true);
  });

  it("has the exact failure line", () => {
    expect(PAGES_MISMATCH_LINE).toBe("Check failed: the pages do not match the text. Do not rely on this printout.");
  });
});

describe("formatPrintDate", () => {
  it("formats ISO dates and date-times in English, without a time-zone shift", () => {
    expect(formatPrintDate("2027-03-12")).toBe("12 Mar 2027");
    expect(formatPrintDate("2025-06-19T23:30:00-07:00")).toBe("19 Jun 2025");
    expect(formatPrintDate("2024-12-01T00:10:00Z")).toBe("1 Dec 2024");
    expect(formatPrintDate(" 2019-03-13 ")).toBe("13 Mar 2019");
  });
  it("returns '' for anything else", () => {
    for (const v of ["", null, undefined, "March 2027", "2027-13-01", "2027-02-30", "2027-00-10", "12/03/2027"]) {
      expect(formatPrintDate(v)).toBe("");
    }
    expect(formatPrintDate("2024-02-29")).toBe("29 Feb 2024");
  });
});

describe("sanitizeFileName / pdfTitle", () => {
  it("strips characters that file systems refuse", () => {
    expect(sanitizeFileName('A/B\\C:D*E?F"G<H>I|J')).toBe("A B C D E F G H I J");
    expect(sanitizeFileName("Takes on \"Alignment Faking\": a review")).toBe("Takes on Alignment Faking a review");
  });
  it("removes control characters and collapses spaces", () => {
    expect(sanitizeFileName("  Line\none\t\ttwo\u0000three\u007f  ")).toBe("Line one two three");
    expect(sanitizeFileName("a b")).toBe("a b");
  });
  it("keeps unicode letters and safe punctuation", () => {
    expect(sanitizeFileName("Demis Hassabis — Scaling, AlphaFold & more (2025)")).toBe("Demis Hassabis — Scaling, AlphaFold & more (2025)");
    expect(sanitizeFileName("Qu'est-ce que l'IA ? Été")).toBe("Qu'est-ce que l'IA Été");
  });
  it("drops leading and trailing dots", () => {
    expect(sanitizeFileName("...hidden.")).toBe("hidden");
  });
  it("cuts long titles at a space, at most 120 characters", () => {
    const long = "word ".repeat(60);
    const out = sanitizeFileName(long);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith("word")).toBe(true);
    const noSpaces = "x".repeat(300);
    expect(sanitizeFileName(noSpaces)).toBe("x".repeat(120));
  });
  it("never cuts an emoji in half", () => {
    const s = "a".repeat(119) + "😀😀";
    const out = sanitizeFileName(s);
    expect(out).toBe("a".repeat(119));
  });
  it("falls back to 'Printout'", () => {
    expect(FILE_NAME_FALLBACK).toBe("Printout");
    for (const v of ["", "   ", "///", "...", null, undefined]) expect(sanitizeFileName(v)).toBe("Printout");
  });
  it("pdfTitle prefers the Notion title, then the page title", () => {
    expect(pdfTitle("The Bitter Lesson", { title: "Page" })).toBe("The Bitter Lesson");
    expect(pdfTitle("", { title: "Page: title" })).toBe("Page title");
    expect(pdfTitle("", null)).toBe("Printout");
  });
});

describe("visibleText with skip (client-side page count)", () => {
  it("skips the subtrees the print page marks data-nocount, and buttons", () => {
    const { document } = new JSDOM(
      `<div id="r"><header data-nocount><h1>Title words</h1></header><p>one two</p><figure><img alt="x"><button>Remove image</button><figcaption>three</figcaption></figure><div data-nocount>[Video not printed: https://y.com]</div><p>four</p></div>`,
    ).window;
    const root = document.getElementById("r")!;
    const text = visibleText(root, " ", (el) => el.hasAttribute("data-nocount"));
    expect(countWords(text)).toBe(4);
    expect(countWords(visibleText(root))).toBeGreaterThan(4);
  });
});
