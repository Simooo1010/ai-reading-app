// Fidelity: word counting, the check line, and content-based detection of
// bot challenges and too-short pages (SPEC.md §7.4 "Fidelity rules").
// Pure functions. The SAME text extraction and word counter are used for the
// source side ("found") and the output side ("printed").

import { JSDOM } from "jsdom";
import { escapeHtml, NON_TEXT_TAGS } from "./sanitize";
import type { FidelityCheck, PrintElement } from "./types";
import { placeholderText } from "./types";

/** Tags that never add visible text (content skipped by the counter). */
const SKIP_TEXT = new Set<string>([...NON_TEXT_TAGS, "input", "embed", "img", "link", "meta", "base", "source", "track"]);

/** Tags that start a new line of text (a word boundary around them). */
const BLOCK_BOUNDARY = new Set<string>([
  "address", "article", "aside", "blockquote", "caption", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hgroup", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td",
  "tfoot", "th", "thead", "tr", "ul", "body", "html", "center", "menu", "mtd", "mtr", "mtable",
]);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;

/**
 * Visible text of a DOM subtree, with a separator at every block boundary and
 * <br> (a space by default; code blocks use "\n").
 * Skips script/style/svg/iframe/... (NON_TEXT_TAGS). Iterative (no recursion limit).
 */
export function visibleText(root: Node, boundary: " " | "\n" = " "): string {
  const parts: string[] = [];
  const pushBoundary = () => {
    if (boundary === " ") {
      parts.push(" ");
      return;
    }
    const last = parts.length ? parts[parts.length - 1] : "";
    if (last && !last.endsWith("\n")) parts.push("\n");
  };
  // Stack of nodes; a `null` marks "push a boundary".
  const stack: (Node | null)[] = [root];
  while (stack.length) {
    const n = stack.pop();
    if (n === null) {
      pushBoundary();
      continue;
    }
    if (n === undefined) continue;
    const type = n.nodeType;
    if (type === TEXT_NODE || type === CDATA_NODE) {
      const v = n.nodeValue ?? "";
      if (v) parts.push(v);
      continue;
    }
    if (type === ELEMENT_NODE) {
      const tag = (n as Element).localName.toLowerCase();
      if (SKIP_TEXT.has(tag)) continue;
      if (tag === "br") {
        parts.push(boundary);
        continue;
      }
      if (BLOCK_BOUNDARY.has(tag)) {
        pushBoundary();
        stack.push(null);
      }
    } else if (type !== 9 && type !== 11) {
      continue; // comments, processing instructions...
    }
    const kids = n.childNodes;
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
  return parts.join("");
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const WORD = /[\p{L}\p{N}\p{M}]+(?:['’‐‑-][\p{L}\p{N}\p{M}]+)*/gu;

/**
 * Unicode-aware word count. A word is a run of letters/numbers (marks
 * included), joined by inner apostrophes or hyphens ("don't", "state-of-the-art").
 * Each Chinese/Japanese character counts as one word.
 * Linear time: the joining characters are not word characters, so there is no backtracking.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  let count = 0;
  CJK.lastIndex = 0;
  while (CJK.exec(text) !== null) count++;
  const rest = count > 0 ? text.replace(CJK, " ") : text;
  WORD.lastIndex = 0;
  while (WORD.exec(rest) !== null) count++;
  return count;
}

export function countNodeWords(node: Node): number {
  return countWords(visibleText(node));
}

/** Counts collected while converting the content area. */
export interface ConvertReport {
  imagesFound: number;
  /** Tracking pixels and lazy-load stubs with no real image (not counted as found). */
  imagesSkipped: number;
  tablesFound: number;
  codeFound: number;
  embedsFound: number;
  widgetsRemoved: number;
  widgetWords: number;
  skippedUnsupported: number;
  unsupportedWords: number;
  /** Words in hidden parts (collapsed sections, closed pop-ups) that are not printed. */
  hiddenWords: number;
  details: string[];
}

export function emptyReport(): ConvertReport {
  return {
    imagesFound: 0,
    imagesSkipped: 0,
    tablesFound: 0,
    codeFound: 0,
    embedsFound: 0,
    widgetsRemoved: 0,
    widgetWords: 0,
    skippedUnsupported: 0,
    unsupportedWords: 0,
    hiddenWords: 0,
    details: [],
  };
}

/** The printable HTML of the elements (for counting only; placeholders excluded). */
export function elementsCountingHtml(elements: PrintElement[]): string {
  const out: string[] = [];
  for (const el of elements) {
    switch (el.type) {
      case "paragraph":
        out.push(`<p>${el.html}</p>`);
        break;
      case "heading":
        out.push(`<h${el.level}>${el.html}</h${el.level}>`);
        break;
      case "blockquote":
      case "pullquote":
        out.push(`<blockquote>${el.html}</blockquote>`);
        break;
      case "list":
        out.push(`<ul>${el.items.map((i) => `<li>${i}</li>`).join("")}</ul>`);
        break;
      case "code":
        out.push(`<pre>${escapeHtml(el.text)}</pre>`);
        break;
      case "table":
        out.push(`<div>${el.html}</div>`);
        break;
      case "image":
        if (el.caption) out.push(`<figure><figcaption>${el.caption}</figcaption></figure>`);
        break;
      case "embed":
        if (el.text) out.push(`<div>${escapeHtml(el.text)}</div>`);
        break;
      case "separator":
      case "placeholder":
        break;
    }
  }
  return out.join("\n");
}

/** Words printed by the elements (parsed back with the same counter as the source). */
export function countPrintedWords(elements: PrintElement[]): number {
  const html = elementsCountingHtml(elements);
  if (!html) return 0;
  const frag = JSDOM.fragment(html);
  return countNodeWords(frag);
}

/** Count `<tag` in the HTML of non-dedicated elements (e.g. an image inside a list item). */
function countKept(elements: PrintElement[], dedicated: PrintElement["type"], tag: string): number {
  let n = 0;
  const re = new RegExp(`<${tag}\\b`, "gi");
  for (const el of elements) {
    if (el.type === dedicated) {
      n++;
      continue;
    }
    const htmls: string[] =
      el.type === "list" ? el.items : "html" in el && typeof el.html === "string" ? [el.html] : [];
    for (const h of htmls) {
      re.lastIndex = 0;
      while (re.exec(h) !== null) n++;
    }
  }
  return n;
}

export const TOLERANCE = 0.02;
/** Hidden words below this are not mentioned in the check line (tiny tooltips, labels). */
export const HIDDEN_NOTE_MIN = 20;
/** Hidden words from which the result becomes a 'warning' (also needs >= 2 % of the words found). */
export const HIDDEN_WARN_MIN = 100;
export const LOW_COVERAGE = 0.6;

export function computeCheck(input: {
  wordsFound: number;
  wordsPage: number;
  elements: PrintElement[];
  report: ConvertReport;
}): FidelityCheck {
  const { wordsFound, wordsPage, elements, report } = input;
  const wordsPrinted = countPrintedWords(elements);
  let placeholderWords = 0;
  let embeds = 0;
  for (const el of elements) {
    const t = placeholderText(el);
    if (t) placeholderWords += countWords(t);
    if (el.type === "embed") embeds++;
  }
  const ratio = wordsFound === 0 ? (wordsPrinted === 0 ? 1 : 0) : wordsPrinted / wordsFound;
  const coverage = wordsPage === 0 ? 0 : wordsPrinted / wordsPage;
  return {
    wordsFound,
    wordsPrinted,
    placeholderWords,
    imagesFound: report.imagesFound,
    imagesKept: countKept(elements, "image", "img"),
    tablesFound: report.tablesFound,
    tablesKept: countKept(elements, "table", "table"),
    codeFound: report.codeFound,
    codeKept: countKept(elements, "code", "pre"),
    embedsFound: report.embedsFound,
    embedsPlaceholdered: embeds,
    widgetsRemoved: report.widgetsRemoved,
    widgetWords: report.widgetWords,
    skippedUnsupported: report.skippedUnsupported,
    wordsHidden: report.hiddenWords,
    wordsPage,
    coverage,
    ratio,
    withinTolerance: Math.abs(1 - ratio) <= TOLERANCE,
    details: [...report.details],
  };
}

/** An empty check (for pages we did not convert: blocked, failed...). */
export function emptyCheck(wordsPage = 0, details: string[] = []): FidelityCheck {
  return {
    wordsFound: 0,
    wordsPrinted: 0,
    placeholderWords: 0,
    imagesFound: 0,
    imagesKept: 0,
    tablesFound: 0,
    tablesKept: 0,
    codeFound: 0,
    codeKept: 0,
    embedsFound: 0,
    embedsPlaceholdered: 0,
    widgetsRemoved: 0,
    widgetWords: 0,
    skippedUnsupported: 0,
    wordsHidden: 0,
    wordsPage,
    coverage: 0,
    ratio: 0,
    withinTolerance: false,
    details,
  };
}

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
export function formatCheckLine(check: FidelityCheck): string {
  const parts: string[] = [];
  parts.push(`Words: ${formatNumber(check.wordsFound)} found, ${formatNumber(check.wordsPrinted)} printed.`);
  parts.push(`Images: ${check.imagesKept} of ${check.imagesFound}.`);
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
  if (!check.withinTolerance) {
    const diff = Math.round(Math.abs(1 - check.ratio) * 100);
    if (check.wordsFound === 0) {
      parts.push("Check failed: we found no text to compare.");
    } else if (check.ratio < 1) {
      parts.push(`Check failed: about ${diff}% of the words are not in the printout.`);
    } else {
      parts.push(`Check failed: the printout has about ${diff}% more words than we found.`);
    }
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

// ─── Content-based detection ─────────────────────────────────────────

const CHALLENGE_TITLES = [
  /^\s*just a moment\b/i,
  /^\s*attention required/i,
  /^\s*please wait\b/i,
  /^\s*checking your browser/i,
  /^\s*verify(ing)? (that )?you are (a )?human/i,
  /^\s*are you a robot/i,
  /^\s*security check/i,
  /^\s*ddos-guard/i,
  /^\s*access denied\b/i,
  /^\s*403 forbidden/i,
  /^\s*one more step\b/i,
];

const CHALLENGE_TEXT = [
  /enable javascript and cookies to continue/i,
  /checking (if the site connection is secure|your browser before accessing)/i,
  /verify(ing)? (that )?you are (a )?human/i,
  /please (complete|solve) the (security check|captcha)/i,
  /press (&|and) hold/i,
  /performance (&|and) security by cloudflare/i,
  /ddos protection by/i,
  /you have been blocked/i,
  /request unsuccessful\. incapsula/i,
];

const CHALLENGE_MARKUP = [
  /\bcf-chl-/i,
  /_cf_chl_opt/i,
  /challenges\.cloudflare\.com/i,
  /\bcf-browser-verification\b/i,
  /\bg-recaptcha\b/i,
  /\bh-captcha\b/i,
  /captcha-delivery\.com/i, // DataDome
  /\bpx-captcha\b/i, // PerimeterX
  /\/_incapsula_resource/i,
];

/** Word limit under which challenge markers count (real articles mention "captcha" in scripts too). */
const CHALLENGE_MAX_WORDS = 300;

/**
 * True when the page is a bot challenge / interstitial instead of the real page.
 * Markers alone are not enough (Substack pages ship Cloudflare scripts): the
 * visible text must also be small.
 */
export function detectBotChallenge(html: string, title: string, bodyWords: number): boolean {
  if (bodyWords > CHALLENGE_MAX_WORDS) return false;
  if (CHALLENGE_TITLES.some((re) => re.test(title))) return true;
  // Only look at the first 200 KB of markup: challenge pages are small.
  const head = html.length > 200_000 ? html.slice(0, 200_000) : html;
  const textHit = CHALLENGE_TEXT.some((re) => re.test(head));
  const markupHit = CHALLENGE_MARKUP.some((re) => re.test(head));
  return (textHit && markupHit) || (markupHit && bodyWords < 50) || (textHit && bodyWords < 50);
}

/** Printed words below which a page is "too short" whatever else we know. */
export const MIN_PRINTED_WORDS = 80;
/** A page with less visible text than this per 100 KB of HTML is treated as a script-only shell. */
export const SHELL_MAX_WORDS = 150;
export const SHELL_MIN_BYTES = 50_000;
/** Scholarly landing page (citation meta, PDF link): this few words means "abstract only". */
export const ABSTRACT_MAX_WORDS = 600;
