// Entry point: already-downloaded HTML + its URL -> PrintResult.
// Pure: no network, no clock. Never throws (malformed input -> 'failed').

import {
  baseUrlOf,
  domShape,
  estimateNesting,
  MAX_DOM_DEPTH,
  MAX_ESTIMATED_NESTING,
  parseDocument,
  READABILITY_MAX_DEPTH,
  READABILITY_MAX_ELEMENTS,
  resolveStreamedContent,
} from "./dom";
import {
  ABSTRACT_MAX_WORDS,
  computeCheck,
  countNodeWords,
  detectBotChallenge,
  emptyCheck,
  HIDDEN_WARN_MIN,
  LOW_COVERAGE,
  MIN_PRINTED_WORDS,
  SHELL_MAX_WORDS,
  SHELL_MIN_BYTES,
} from "./fidelity";
import { extractGeneric, hiddenWordsOf, isArxivAbsUrl, isArxivHtmlUrl, pageText } from "./generic";
import { metaContent } from "./meta";
import { extractSubstack, isSubstack, isSubstackNoteUrl } from "./substack";
import type { FidelityCheck, PrintDocument, PrintResult, PrintSource, PrintStatus, PrintWarning } from "./types";

export interface ExtractOptions {
  /** HTTP status of the download, when the caller has it (401/402/403/429 change the result). */
  httpStatus?: number;
  /** Force the arXiv HTML path (the caller rewrote an /abs/ link to /html/). */
  source?: "arxiv-html";
  /**
   * Reading time in minutes from Notion ("Reading time (min)"), when known.
   * A page with far less text than that (a landing page, a first chapter) is 'too-short'.
   */
  expectedMinutes?: number;
}

/** Normal pages in the list print 119-189 words per Notion minute; under this we got only a part. */
export const MIN_WORDS_PER_EXPECTED_MINUTE = 30;

export const MESSAGES = {
  ok: "Ready to print.",
  blocked: "This site did not let us read the page. Open the source instead.",
  login: "This page needs a login. Open the source instead.",
  rateLimited: "The site asked us to wait. Try again later, or open the source instead.",
  paywalledPreview: "Only part of this post is public. The rest is for paid readers.",
  paywalledNone: "This page is for paid readers. Open the source instead.",
  tooShort: "We found very little text on this page. It may load its text with scripts or be only a summary.",
  arxivAbstract: "This is only the summary page of a paper. Print the full paper (HTML or PDF) instead.",
  failed: "We could not read this page. Open the source instead.",
  empty: "This page is empty. Open the source instead.",
  note: "Substack Notes cannot be printed yet. Open the source instead.",
  warningPrefix: "Ready to print, but please check:",
} as const;

const WARN = {
  lowCoverage: "We may have missed part of this page.",
  ratioLow: "Some text may be missing from the printout.",
  ratioHigh: "The printout has more text than we found on the page. Please check it.",
  placeholders: "Videos and other embeds are printed as links.",
  imagePlaceholders: "Some images, charts or drawings could not be printed. They are marked in the text.",
  hidden: "Some collapsed or hidden parts of the page are not printed.",
  partOnly: "We found much less text than the reading time suggests. This may be only a part of the piece.",
  unsupported: "Some parts of the page could not be printed. They are marked in the text.",
  imagesMissing: "Some images could not be printed.",
  paywall: "Only the free part is in the printout.",
  abstractOnly: "This page seems to have only a summary. The full text may be in a PDF or on another page.",
  tooShort: "There is very little text on this page.",
} as const;

function result(
  status: PrintStatus,
  message: string,
  source: PrintSource,
  check: FidelityCheck,
  warnings: PrintWarning[] = [],
  document?: PrintDocument,
): PrintResult {
  const r: PrintResult = { status, message, source, check, warnings };
  if (document) r.document = document;
  return r;
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function extractPrintable(html: string, url: string, opts: ExtractOptions = {}): PrintResult {
  return extractAndInspect(html, url, opts);
}

/**
 * Same as extractPrintable; `inspect` (tests only) receives the converted
 * content node before the DOM is closed.
 */
export function extractAndInspect(
  html: string,
  url: string,
  opts: ExtractOptions = {},
  inspect?: (contentNode: Element) => void,
): PrintResult {
  const guessSource: PrintSource = opts.source === "arxiv-html" || isArxivHtmlUrl(url) ? "arxiv-html" : "web";
  try {
    return run(html, url, opts, guessSource, inspect);
  } catch (e) {
    const why = e instanceof Error ? e.message.slice(0, 200) : "unknown error";
    return result("failed", MESSAGES.failed, guessSource, emptyCheck(0, [`Error: ${why}`]));
  }
}

function run(
  html: string,
  url: string,
  opts: ExtractOptions,
  guessSource: PrintSource,
  inspect?: (contentNode: Element) => void,
): PrintResult {
  if (typeof html !== "string" || !html.trim()) {
    return result("failed", MESSAGES.empty, guessSource, emptyCheck(0, ["The HTML was empty."]));
  }
  if (!isHttpUrl(url)) {
    return result("failed", MESSAGES.failed, guessSource, emptyCheck(0, ["The page URL is not http(s)."]));
  }
  if (isSubstackNoteUrl(url)) {
    return result("failed", MESSAGES.note, "substack", emptyCheck(0, ["Substack Notes are out of scope for Print v1."]));
  }

  const nesting = estimateNesting(html);
  if (nesting > MAX_ESTIMATED_NESTING) {
    return result("failed", MESSAGES.failed, guessSource, emptyCheck(0, [`The page is nested about ${nesting} levels deep.`]));
  }

  const dom = parseDocument(html, url);
  try {
    const doc = dom.window.document;
    const baseUrl = baseUrlOf(doc, url);
    const streamed = resolveStreamedContent(doc);
    const shape = domShape(doc.documentElement);
    if (shape.depth > MAX_DOM_DEPTH) {
      // jsdom itself recurses on clone/serialize: refuse instead of risking a stack overflow.
      return result("failed", MESSAGES.failed, guessSource, emptyCheck(0, [`The page is nested ${shape.depth} levels deep.`]));
    }
    const bodyWords = doc.body ? countNodeWords(doc.body) : 0;
    const title = (doc.title ?? "").trim();

    // HTTP status hints from the caller.
    const st = opts.httpStatus;
    if (st === 401 || st === 407) {
      return result("blocked", MESSAGES.login, guessSource, emptyCheck(bodyWords, [`HTTP ${st}.`]));
    }
    if (st === 429) {
      return result("blocked", MESSAGES.rateLimited, guessSource, emptyCheck(bodyWords, ["HTTP 429."]));
    }
    if (detectBotChallenge(html, title, bodyWords)) {
      return result("blocked", MESSAGES.blocked, guessSource, emptyCheck(bodyWords, ["Bot challenge page detected."]));
    }
    if (st === 403 || st === 451) {
      return result("blocked", MESSAGES.blocked, guessSource, emptyCheck(bodyWords, [`HTTP ${st}.`]));
    }
    if (st === 402) {
      return result("paywalled", MESSAGES.paywalledNone, guessSource, emptyCheck(bodyWords, ["HTTP 402."]));
    }
    if (bodyWords === 0) {
      return result("failed", MESSAGES.empty, guessSource, emptyCheck(0, ["No visible text on the page."]));
    }

    const page = pageText(doc);
    const wordsPage = page.words;
    const pageDetail = page.removed.length
      ? `Page text not counted (boilerplate): ${page.removed
          .slice(0, 5)
          .map((r) => `${r.what} ${r.words} words`)
          .join(", ")}${page.removed.length > 5 ? `, and ${page.removed.length - 5} more` : ""}.`
      : "";
    const warnings: PrintWarning[] = [];
    let source: PrintSource = guessSource;
    let document: PrintDocument;
    let check: FidelityCheck;
    let paywalled = false;

    const sub = guessSource === "web" && isSubstack(doc, html, url) ? extractSubstack(doc, url, baseUrl) : null;
    if (sub) {
      source = "substack";
      document = sub.document;
      check = computeCheck({ wordsFound: sub.convert.wordsFound, wordsPage, elements: document.elements, report: sub.convert.report });
      check.details.unshift(...sub.details);
      if (pageDetail) check.details.push(pageDetail);
      if (streamed > 0) check.details.push(`Moved ${streamed} streamed part(s) of the page into place (React streaming).`);
      paywalled = sub.paywall.paywalled;
      inspect?.(sub.contentNode);
    } else {
      const gen = extractGeneric(doc, url, baseUrl, {
        arxiv: source === "arxiv-html",
        wordsPage,
        pageHiddenWords: hiddenWordsOf(page.removed),
        skipReadability: shape.depth > READABILITY_MAX_DEPTH || shape.elements > READABILITY_MAX_ELEMENTS,
      });
      document = gen.document;
      check = computeCheck({ wordsFound: gen.convert.wordsFound, wordsPage, elements: document.elements, report: gen.convert.report });
      check.details.unshift(...gen.details);
      inspect?.(gen.contentNode);
      if (pageDetail) check.details.push(pageDetail);
      if (streamed > 0) check.details.push(`Moved ${streamed} streamed part(s) of the page into place (React streaming).`);
      if (gen.ld?.isAccessibleForFree === false) {
        paywalled = true;
        check.details.push("JSON-LD says the page is not free (isAccessibleForFree=false).");
      }
    }

    // ── Paywall: never a silent half-printout ──
    if (paywalled) {
      warnings.push({ code: "paywall", message: WARN.paywall });
      const msg = check.wordsPrinted > 0 ? MESSAGES.paywalledPreview : MESSAGES.paywalledNone;
      return result("paywalled", msg, source, check, warnings, document);
    }

    // ── Too short / script shell / abstract only ──
    if (isArxivAbsUrl(url)) {
      warnings.push({ code: "abstract-only", message: WARN.abstractOnly });
      return result("too-short", MESSAGES.arxivAbstract, source, check, warnings, document);
    }
    const shell = html.length >= SHELL_MIN_BYTES && wordsPage < SHELL_MAX_WORDS;
    const tiny = check.wordsPrinted < MIN_PRINTED_WORDS;
    const minutes = opts.expectedMinutes;
    const partOnly =
      typeof minutes === "number" &&
      Number.isFinite(minutes) &&
      minutes > 0 &&
      source !== "arxiv-html" &&
      check.wordsPrinted < minutes * MIN_WORDS_PER_EXPECTED_MINUTE;
    const scholarly =
      source === "web" &&
      (metaContent(doc, "citation_pdf_url") !== "" || metaContent(doc, "citation_title") !== "") &&
      check.wordsPrinted < ABSTRACT_MAX_WORDS;
    if (shell || tiny || scholarly || partOnly) {
      if (scholarly) warnings.push({ code: "abstract-only", message: WARN.abstractOnly });
      else if (partOnly && !shell && !tiny) warnings.push({ code: "too-short", message: WARN.partOnly });
      else warnings.push({ code: "too-short", message: WARN.tooShort });
      check.details.push(
        shell
          ? `Script shell: ${wordsPage} words of page text in ${html.length} bytes of HTML.`
          : tiny
            ? `Only ${check.wordsPrinted} words printed (minimum ${MIN_PRINTED_WORDS}).`
            : scholarly
              ? `Scholarly landing page with ${check.wordsPrinted} words (citation meta present).`
              : `Only ${check.wordsPrinted} words for a ${minutes}-minute read (minimum ${MIN_WORDS_PER_EXPECTED_MINUTE} words per minute).`,
      );
      return result("too-short", MESSAGES.tooShort, source, check, warnings, document);
    }

    // ── Warnings ──
    if (check.coverage < LOW_COVERAGE) warnings.push({ code: "low-coverage", message: WARN.lowCoverage });
    if (!check.withinTolerance) {
      warnings.push({ code: "ratio-out-of-tolerance", message: check.ratio < 1 ? WARN.ratioLow : WARN.ratioHigh });
    }
    if (check.skippedUnsupported > 0) warnings.push({ code: "unsupported-content", message: WARN.unsupported });
    if (check.embedsPlaceholdered > 0) warnings.push({ code: "placeholders", message: WARN.placeholders });
    if (document.elements.some((e) => e.type === "placeholder" && e.kind !== "unsupported")) {
      warnings.push({ code: "placeholders", message: WARN.imagePlaceholders });
    }
    if (check.wordsHidden >= HIDDEN_WARN_MIN && check.wordsHidden >= check.wordsFound * 0.02) {
      warnings.push({ code: "hidden-content", message: WARN.hidden });
    }
    if (check.imagesKept < check.imagesFound) warnings.push({ code: "images-missing", message: WARN.imagesMissing });

    if (warnings.length === 0 && check.withinTolerance) {
      return result("ok", MESSAGES.ok, source, check, warnings, document);
    }
    const message = `${MESSAGES.warningPrefix} ${warnings.map((w) => w.message).join(" ")}`;
    return result("warning", message, source, check, warnings, document);
  } finally {
    dom.window.close();
  }
}
