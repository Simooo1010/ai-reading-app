// Text for the print page: the check line, dates and PDF file names.
// Client-safe pure functions (no jsdom, no Node modules): the print page
// imports this file directly. lib/print/fidelity.ts re-exports the check-line
// helpers so server code and old imports keep working.

import type { FidelityCheck, PrintDocument, PrintStatus, PrintWarning, PrintWarningCode } from "./types";

export const TOLERANCE = 0.02;
/** Hidden words below this are not mentioned in the check line (tiny tooltips, labels). */
export const HIDDEN_NOTE_MIN = 20;
export const LOW_COVERAGE = 0.6;

/** 8651 -> "8,651" (fixed format, not locale-dependent). */
export function formatNumber(n: number): string {
  const s = String(Math.round(Math.abs(n)));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s[i];
  }
  return (n < 0 ? "-" : "") + out;
}

/**
 * The check line for the UI, in simple English. It never says the check
 * passed when `withinTolerance` is false.
 */
export function formatCheckLine(check: FidelityCheck, opts: { imagesNotLoaded?: number } = {}): string {
  // Images the browser could not load print as a web address, not as a picture.
  const notLoaded = Math.min(Math.max(0, Math.floor(opts.imagesNotLoaded ?? 0)), check.imagesKept);
  const parts: string[] = [];
  parts.push(`Words: ${formatNumber(check.wordsFound)} found, ${formatNumber(check.wordsPrinted)} printed.`);
  parts.push(`Images: ${check.imagesKept - notLoaded} of ${check.imagesFound}.`);
  parts.push(`Tables: ${check.tablesKept} of ${check.tablesFound}.`);
  if (check.codeFound > 0 || check.codeKept > 0) parts.push(`Code blocks: ${check.codeKept} of ${check.codeFound}.`);
  if (check.embedsPlaceholdered > 0) {
    parts.push(
      `${check.embedsPlaceholdered} video${check.embedsPlaceholdered === 1 ? " or embed is" : "s or embeds are"} shown as links.`,
    );
  }
  if (check.skippedUnsupported > 0) {
    parts.push(
      `${check.skippedUnsupported} part${check.skippedUnsupported === 1 ? "" : "s"} of the page could not be printed and ${check.skippedUnsupported === 1 ? "is" : "are"} marked in the text.`,
    );
  }
  const notLoadedLine =
    notLoaded > 0
      ? `${notLoaded === 1 ? "1 image" : `${notLoaded} images`} could not be loaded: the printout shows ${notLoaded === 1 ? "its web address" : "their web addresses"} instead.`
      : "";
  if (!check.withinTolerance) {
    const diff = Math.round(Math.abs(1 - check.ratio) * 100);
    if (check.wordsFound === 0) {
      parts.push("Check failed: we found no text to compare.");
    } else if (check.ratio < 1) {
      parts.push(`Check failed: about ${diff}% of the words are not in the printout.`);
    } else {
      parts.push(`Check failed: the printout has about ${diff}% more words than we found.`);
    }
    if (notLoadedLine) parts.push(notLoadedLine);
  } else if (notLoaded > 0) {
    parts.push(`Check: all words are here, but ${notLoadedLine}`);
  } else if (check.imagesKept < check.imagesFound || check.tablesKept < check.tablesFound || check.codeKept < check.codeFound) {
    parts.push("Check: all words are here, but some images, tables or code blocks are missing.");
  } else {
    parts.push("Check passed.");
  }
  if (check.wordsHidden >= HIDDEN_NOTE_MIN) {
    parts.push(`${formatNumber(check.wordsHidden)} words in collapsed or hidden parts of the page are not printed.`);
  }
  if (check.wordsPage > 0 && check.coverage < LOW_COVERAGE) {
    parts.push(`We may have missed part of this page: the printout has ${Math.round(check.coverage * 100)}% of the page text.`);
  }
  return parts.join(" ");
}

// ─── Check of the real pages (print screen) ───────────────────────────

export const PAGES_MISMATCH_LINE = "Check failed: the pages do not match the text. Do not rely on this printout.";

export interface PageCheckInput {
  check: FidelityCheck;
  /** Embeds left out with "Leave out videos and embeds". */
  excludedEmbeds: number;
  /** Images removed one by one in the preview. */
  removedImages: number;
  /** Words of printed text inside what the user left out (embed text, captions). */
  excludedWords: number;
  /** Words counted in the packed page DOM, or null while the pages are not ready. */
  wordsOnPages: number | null;
  /** Printed images the browser could not load (shown as their web address). */
  imagesNotLoaded?: number;
}

export interface PageCheck {
  /** formatCheckLine(check): what the extraction found and kept. */
  checkLine: string;
  /** "Left out by you: 2 embeds, 1 image." or null. */
  leftOut: string | null;
  /** "On the pages: 8,651 words." or null while the pages are not ready. */
  onPages: string | null;
  /** Words the pages should hold: wordsPrinted minus what the user left out. */
  expectedWords: number;
  /** True when the pages differ from the expected words by more than 2 %. */
  mismatch: boolean;
  /** Images that could not be loaded (0 when all loaded). The check line says so; it never says "Check passed" then. */
  imagesNotLoaded: number;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function pageCheck(input: PageCheckInput): PageCheck {
  const { check, excludedEmbeds, removedImages, excludedWords, wordsOnPages } = input;
  const imagesNotLoaded = Math.min(Math.max(0, Math.floor(input.imagesNotLoaded ?? 0)), check.imagesKept);
  const left: string[] = [];
  if (excludedEmbeds > 0) left.push(plural(excludedEmbeds, "embed", "embeds"));
  if (removedImages > 0) left.push(plural(removedImages, "image", "images"));
  const expectedWords = Math.max(0, check.wordsPrinted - excludedWords);
  let mismatch = false;
  if (wordsOnPages !== null) {
    const diff = Math.abs(wordsOnPages - expectedWords);
    mismatch = expectedWords === 0 ? wordsOnPages !== 0 : diff / expectedWords > TOLERANCE;
  }
  return {
    checkLine: formatCheckLine(check, { imagesNotLoaded }),
    leftOut: left.length ? `Left out by you: ${left.join(", ")}.` : null,
    onPages: wordsOnPages === null ? null : `On the pages: ${formatNumber(wordsOnPages)} words.`,
    expectedWords,
    mismatch,
    imagesNotLoaded,
  };
}

// ─── Notice on the print screen ───────────────────────────────────────

/** Warnings that only repeat the headline message of a partial result (QA LOW-3). */
const COVERED_BY_MESSAGE: Partial<Record<PrintStatus, readonly PrintWarningCode[]>> = {
  "too-short": ["too-short", "abstract-only"],
  paywalled: ["paywall"],
};

/**
 * The bullet list under the notice: each message once, without the warnings
 * the headline message already says (too short, summary only, paywall).
 */
export function noticeWarnings(status: PrintStatus, warnings: readonly PrintWarning[]): string[] {
  const covered = COVERED_BY_MESSAGE[status] ?? [];
  const out: string[] = [];
  for (const w of warnings) {
    if (covered.includes(w.code)) continue;
    const m = w.message.trim();
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

// ─── Dates and names ──────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2027-03-12" or "2027-03-12T08:00:00Z" -> "12 Mar 2027". Uses the calendar
 * date written in the string (no time-zone shift). "" for anything else.
 */
export function formatPrintDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > days) return "";
  return `${d} ${MONTHS[mo - 1]} ${y}`;
}

export const FILE_NAME_FALLBACK = "Printout";
export const FILE_NAME_MAX = 120;

/**
 * A safe file name for "Save as PDF" (the browser uses document.title):
 * no / \ : * ? " < > | or control characters, spaces collapsed, at most
 * 120 characters (cut at a space when possible), "Printout" when empty.
 */
export function sanitizeFileName(title: string | undefined | null): string {
  if (typeof title !== "string") return FILE_NAME_FALLBACK;
  let s = title.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ");
  s = s.replace(/[/\\:*?"<>|]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > FILE_NAME_MAX) {
    const cut = s.slice(0, FILE_NAME_MAX);
    const space = cut.lastIndexOf(" ");
    s = space >= FILE_NAME_MAX * 0.6 ? cut.slice(0, space) : cut;
    // Never end on half of a surrogate pair.
    if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1);
  }
  // Windows does not allow names that end with a dot or a space.
  s = s.replace(/[.\s]+$/, "").replace(/^[.\s]+/, "");
  return s || FILE_NAME_FALLBACK;
}

/** The PDF file name: the Notion title, else the page title, else "Printout". */
export function pdfTitle(itemTitle: string | undefined | null, doc?: Pick<PrintDocument, "title"> | null): string {
  const a = sanitizeFileName(itemTitle);
  if (a !== FILE_NAME_FALLBACK) return a;
  return sanitizeFileName(doc?.title);
}
