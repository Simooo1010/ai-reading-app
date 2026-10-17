// "Print in Italian" (SPEC.md §7.4, Italian): an English PrintResult -> the
// same result with the document in Italian. Server side only. Never throws.
//
// Only the document changes (same elements, same order, same types); status,
// warnings, source and message stay as they were. The check is recomputed on
// the Italian text: the ±2 % word rule compares a page with its own printout,
// so after translation "found" and "printed" are the Italian word count. An
// English check that failed stays failed (ratio and withinTolerance kept).
// Complete translations are cached per URL for 24 h; partial ones are not, so
// the next try can finish them (the segment cache keeps the parts already done).

import { createPrintCache, normalizeCacheKey, type PrintCache } from "../cache";
import { countPrintedWords } from "../fidelity";
import type { PrintResult } from "../types";
import { translateTexts, type TranslateDeps } from "./engine";
import { applyTranslations, collectSegments, finalizeSegment } from "./segments";
import type { TranslationInfo } from "./types";

export type TranslateOutcome = { result: PrintResult; info: TranslationInfo } | { unavailable: true };

export const TRANSLATED_DETAIL = "Translated to Italian";

const UNAVAILABLE: TranslateOutcome = { unavailable: true };

export function isCacheableOutcome(o: TranslateOutcome): boolean {
  return "info" in o && o.info.status === "complete";
}

const sharedDocCache = createPrintCache<TranslateOutcome>({ maxEntries: 30, isCacheable: isCacheableOutcome });

export interface TranslatePrintDeps extends TranslateDeps {
  /** Default: the module cache shared by all requests of this instance. */
  docCache?: PrintCache<TranslateOutcome>;
}

export function translationCacheKey(url: string): string {
  return `${normalizeCacheKey(url)}|it`;
}

async function translateNow(result: PrintResult, deps: TranslatePrintDeps): Promise<TranslateOutcome> {
  const doc = result.document;
  if (!doc) return UNAVAILABLE;
  const segments = collectSegments(doc);
  if (segments.length === 0) return UNAVAILABLE;

  const { out, engines } = await translateTexts(
    segments.map((s) => s.text),
    (i, t) => finalizeSegment(segments[i], t, doc.url) !== null,
    deps,
  );
  const { document, translated } = applyTranslations(doc, segments, out);
  if (translated === 0) return UNAVAILABLE;

  const words = countPrintedWords(document.elements);
  // An English check that failed (text missing from the printout) stays failed
  // in Italian: the translation never turns "Check failed" into "Check passed".
  const englishOk = result.check.withinTolerance;
  const info: TranslationInfo = {
    language: "it",
    status: translated === segments.length ? "complete" : "partial",
    translated,
    total: segments.length,
    engines,
  };
  return {
    result: {
      ...result,
      document,
      check: {
        ...result.check,
        wordsFound: words,
        wordsPrinted: words,
        ratio: englishOk ? 1 : result.check.ratio,
        withinTolerance: englishOk,
        details: [...result.check.details, TRANSLATED_DETAIL],
      },
    },
    info,
  };
}

/** Translate the document of `result` to Italian. Never throws. */
export async function translatePrintResult(result: PrintResult, deps: TranslatePrintDeps = {}): Promise<TranslateOutcome> {
  const log = deps.log ?? ((m: string) => console.warn(m));
  try {
    const url = result.document?.url;
    if (!url) return await translateNow(result, deps);
    const cache = deps.docCache ?? sharedDocCache;
    return await cache.cachedParse(translationCacheKey(url), () => translateNow(result, deps));
  } catch (e) {
    log(`translate: failed: ${e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : "unknown"}`);
    return UNAVAILABLE;
  }
}
