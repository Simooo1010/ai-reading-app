// Print in Italian (SPEC.md §7.4): the client-side rules around the
// translateToItalian server action, and the notes on the paper itself.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrintBlock, type BlockSpec, type ImageActions } from "@/components/print/PrintBlocks";
import {
  blockIdPrefix,
  canPrint,
  isPartialTranslation,
  isPrintLanguage,
  LANGUAGE_LABELS,
  paperTranslationNotes,
  PRINT_LANGUAGES,
  printFileTitle,
  translateErrorMessage,
  translationCheckLine,
  translationWarning,
  usableTranslation,
} from "@/lib/print/language";
import { TRANSLATE_MESSAGES, type TranslateActionResult, type TranslationInfo } from "@/lib/print/translate/types";
import type { PrintDocument, PrintResult } from "@/lib/print/types";

const doc: PrintDocument = {
  url: "https://example.com/post",
  title: "Un post",
  subtitle: "",
  author: "Someone",
  publication: "",
  date: "2026-10-01",
  elements: [{ type: "paragraph", html: "Ciao a tutti." }],
};

const check = { wordsPrinted: 3 } as unknown as PrintResult["check"];

function result(over: Partial<PrintResult> = {}): PrintResult {
  return { status: "ok", document: doc, check, warnings: [], message: "Ready to print.", source: "web", ...over };
}

const complete: TranslationInfo = { language: "it", status: "complete", translated: 4, total: 4, engines: ["gemini"] };
const partial: TranslationInfo = { language: "it", status: "partial", translated: 3, total: 4, engines: ["gemini", "google"] };

describe("languages", () => {
  it("English and Italiano, each in its own name", () => {
    expect(PRINT_LANGUAGES).toEqual(["en", "it"]);
    expect(LANGUAGE_LABELS).toEqual({ en: "English", it: "Italiano" });
    expect(isPrintLanguage("it")).toBe(true);
    for (const v of ["IT", "fr", "", null, 1]) expect(isPrintLanguage(v)).toBe(false);
  });

  it("block ids carry the language (a switch measures the pages again)", () => {
    expect(blockIdPrefix("en")).toBe("");
    expect(blockIdPrefix("it")).toBe("it-");
  });
});

describe("the action's answer", () => {
  it("uses a printable Italian result", () => {
    const res: TranslateActionResult = { ok: true, result: result(), info: complete };
    expect(usableTranslation(res)).toEqual({ result: res.result, info: complete });
    const paywalled: TranslateActionResult = { ok: true, result: result({ status: "paywalled" }), info: partial };
    expect(usableTranslation(paywalled)).not.toBeNull();
  });

  it("refuses errors and broken answers: the page stays English", () => {
    const bad: unknown[] = [
      null,
      undefined,
      { ok: false, error: "x" },
      { ok: true, result: result({ document: undefined }), info: complete },
      { ok: true, result: result({ document: { ...doc, elements: [] } }), info: complete },
      { ok: true, result: result({ status: "failed" }), info: complete },
      { ok: true, result: result({ status: "blocked" }), info: complete },
      { ok: true, result: result({ check: undefined as unknown as PrintResult["check"] }), info: complete },
      { ok: true, result: result(), info: { ...complete, language: "fr" } },
      { ok: true, result: result(), info: { ...complete, status: "unavailable" } },
      { ok: true, result: result(), info: { ...complete, translated: Number.NaN } },
      { ok: true, result: result() },
    ];
    for (const res of bad) expect(usableTranslation(res as TranslateActionResult)).toBeNull();
  });

  it("shows the server's message, else the default one", () => {
    expect(translateErrorMessage({ ok: false, error: TRANSLATE_MESSAGES.signIn })).toBe("Please sign in again.");
    expect(translateErrorMessage({ ok: false, error: "  " })).toBe(TRANSLATE_MESSAGES.unavailable);
    expect(translateErrorMessage(null)).toBe("Italian is not available right now. Try again in a few minutes.");
    expect(translateErrorMessage({ ok: true, result: result(), info: complete })).toBe(TRANSLATE_MESSAGES.unavailable);
  });

  it("knows which results can be printed", () => {
    expect(canPrint(result())).toBe(true);
    expect(canPrint(result({ status: "too-short" }))).toBe(true);
    expect(canPrint(result({ status: "failed" }))).toBe(false);
    expect(canPrint(result({ document: undefined }))).toBe(false);
  });
});

describe("notes and check lines", () => {
  it("always says it is a machine translation; partial adds the partial note", () => {
    expect(paperTranslationNotes(complete)).toEqual([TRANSLATE_MESSAGES.machineNote]);
    expect(paperTranslationNotes(partial)).toEqual([TRANSLATE_MESSAGES.machineNote, TRANSLATE_MESSAGES.partialNote]);
  });

  it("never lets a half-translated page pass silently", () => {
    const odd = { ...complete, translated: 3 }; // "complete" but a part is missing
    expect(isPartialTranslation(odd)).toBe(true);
    expect(paperTranslationNotes(odd)).toContain(TRANSLATE_MESSAGES.partialNote);
    expect(translationWarning(odd)).toContain("Partial translation");
    expect(translationWarning(complete)).toBeNull();
    expect(translationWarning(partial)).toBe(
      "Partial translation: some parts are still in English. Look at the preview before you print. To try the rest again, tap English, then Italiano.",
    );
  });

  it("counts the translated parts in simple words", () => {
    expect(translationCheckLine(complete)).toBe("Translated 4 of 4 parts.");
    expect(translationCheckLine(partial)).toBe("Translated 3 of 4 parts.");
    expect(translationCheckLine({ translated: 1, total: 1 })).toBe("Translated 1 of 1 part.");
    expect(translationCheckLine({ translated: 9, total: 4 })).toBe("Translated 4 of 4 parts.");
  });

  it("names the PDF with the Italian title in Italian", () => {
    expect(printFileTitle("it", "A post", doc)).toBe("Un post");
    expect(printFileTitle("en", "A post", doc)).toBe("A post");
    expect(printFileTitle("it", "A post", { title: " " })).toBe("A post");
  });
});

describe("the Italian printout says so on the paper", () => {
  const actions: ImageActions = { interactive: false, failed: new Set() };
  const traits = { keepWithNext: false, breakable: false, atomic: true };
  const html = (block: BlockSpec) => renderToStaticMarkup(createElement(PrintBlock, { block, actions }));
  const blocks = (notes?: readonly string[]): BlockSpec[] => [
    { id: "it-head", kind: "head", doc, fallbackTitle: "t", fallbackAuthor: "a", translationNotes: notes, traits },
    { id: "it-foot", kind: "foot", doc, fallbackTitle: "t", fallbackAuthor: "a", fallbackUrl: "u", translationNotes: notes, traits },
  ];

  it("header and footer carry the machine note", () => {
    for (const out of blocks(paperTranslationNotes(complete)).map(html)) {
      expect(out).toContain(TRANSLATE_MESSAGES.machineNote);
      expect(out).not.toContain("Partial translation");
      expect(out).toContain('class="rr-print-partial" data-kind="translation" lang="en"');
      expect(out).toContain("https://example.com/post"); // the source stays
    }
  });

  it("a partial translation says so in header and footer", () => {
    for (const out of blocks(paperTranslationNotes(partial)).map(html)) {
      expect(out).toContain(TRANSLATE_MESSAGES.machineNote);
      expect(out).toContain(TRANSLATE_MESSAGES.partialNote);
    }
  });

  it("an English printout has no translation note", () => {
    for (const out of blocks().map(html)) expect(out).not.toContain("Translated to Italian");
  });
});
