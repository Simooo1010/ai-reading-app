// Generic web pages (SPEC.md §7.4: "Other web pages" and arXiv HTML).
// Readability can drop real content, so we compare several candidates and
// always measure coverage against the whole page text (fidelity rule 4).

import { Readability } from "@mozilla/readability";
import { INLINE_TAGS } from "./sanitize";
import { convertContent, isContentForm, prepareContent, removeHidden, type ConvertResult } from "./convert";
import { countNodeWords, countWords, emptyReport, visibleText } from "./fidelity";
import {
  cleanAuthor,
  hostLabel,
  joinAuthors,
  metaAll,
  metaContent,
  normalizeDate,
  readJsonLd,
  textOf,
  type LdArticle,
} from "./meta";
import type { PrintDocument } from "./types";

/** Always boilerplate, wherever it is. */
const BOILERPLATE_SELECTOR = [
  "script",
  "style",
  "noscript",
  "template",
  "nav",
  "dialog",
  "[role=navigation]",
  "[role=banner]",
  "[role=contentinfo]",
  "[role=complementary]",
  "[role=search]",
].join(", ");

/**
 * class/id patterns. STRONG ones are removed whatever their size; WEAK ones
 * only when they hold less than a quarter of the page text (a main wrapper
 * called "with-sidebar" must not vanish).
 * Linear regexes: literal alternatives between fixed separators.
 */
const STRONG_BOILERPLATE =
  /(?:^|[\s_-])(?:cookies?|consent|gdpr|newsletter|subscribe|subscription|advert|advertisement|ads|adslot|sponsored|popup|modal|comments?|disqus)(?:[\s_-]|$)/i;
const WEAK_BOILERPLATE =
  /(?:^|[\s_-])(?:sidebar|share|sharing|social|promo|banner|breadcrumbs?|navbar|menu|toolbar|masthead|recommended|related-(?:posts|articles|stories|content|links|reading))(?:[\s_-]|$)/i;

const KEEPS_CONTENT = "main, article, [role=main], h1";

const INLINE_NAMES = new Set<string>([...INLINE_TAGS, "math", "font", "label", "img", "picture"]);

function classAndId(el: Element): string {
  return `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`.slice(0, 2000);
}

export const HIDDEN_PART = "hidden parts";

export function hiddenWordsOf(removed: RemovedPart[]): number {
  return removed.filter((r) => r.what === HIDDEN_PART).reduce((n, r) => n + r.words, 0);
}

export interface RemovedPart {
  what: string;
  words: number;
}

function describe(el: Element): string {
  const cls = Array.from(el.classList).slice(0, 3).join(".");
  return `<${el.localName}${cls ? "." + cls : ""}>`.slice(0, 80);
}

/**
 * Remove boilerplate from `root` IN PLACE (pass a clone) and return what was
 * removed (for the report). Hidden parts go too. Header/footer/aside are
 * removed only outside <article>/<main> (inside, they often hold the title,
 * sidenotes or footnotes).
 */
export function stripBoilerplate(root: Element): RemovedPart[] {
  const removed: RemovedPart[] = [];
  const drop = (el: Element) => {
    const words = countNodeWords(el);
    if (words > 0) removed.push({ what: describe(el), words });
    el.remove();
  };
  for (const el of Array.from(root.querySelectorAll(BOILERPLATE_SELECTOR))) if (root.contains(el)) drop(el);
  for (const el of Array.from(root.querySelectorAll("form"))) {
    if (root.contains(el) && !isContentForm(el)) drop(el);
  }
  for (const el of Array.from(root.querySelectorAll("header, footer, aside"))) {
    if (!root.contains(el)) continue;
    if (el.closest("article, main, [role=main]")) continue;
    if (el.querySelector(KEEPS_CONTENT)) continue;
    drop(el);
  }
  removed.push(...stripNamedBoilerplate(root));
  // Hidden parts (collapsed sections, closed pop-ups) last, so hidden menus count as boilerplate.
  const hidden = removeHidden(root);
  if (hidden > 0) removed.push({ what: HIDDEN_PART, words: hidden });
  return removed;
}

/**
 * LessWrong, the Alignment Forum and the EA Forum run the same software
 * (ForumMagnum). Around the post it prints vote counts, tag lists, the comment
 * outline (a list of commenter names), "Mentioned in" and recommendations, with
 * class names our generic patterns do not catch. The title, author and date of
 * the post header are printed from the page metadata. The post itself is in
 * .PostsPage-postContent and is never touched.
 */
const FORUM_MAGNUM_MARK = "PostsPage-postContent";
const FORUM_MAGNUM_FURNITURE = [
  ".LWPostsPageHeader-root",
  ".PostsPageHeader-root",
  ".MultiToCLayout-toc",
  ".MultiToCLayout-tocFooter",
  ".PostsBottomBar-root",
  ".PostsPagePostFooter-footerTagList",
  ".PostsPagePostFooter-footerSection",
  ".CommentsListSection-root",
  ".PingbacksList-root",
  ".PostBottomRecommendations-root",
  ".PostBottomRecommendations-section",
].join(", ");

/** Removes ForumMagnum page furniture from `root` IN PLACE (nothing on other sites). */
function removeForumMagnumFurniture(root: Element): RemovedPart[] {
  const removed: RemovedPart[] = [];
  if (!isForumMagnum(root)) return removed;
  for (const el of Array.from(root.querySelectorAll(FORUM_MAGNUM_FURNITURE))) {
    if (el === root || !root.contains(el)) continue;
    const words = countNodeWords(el);
    if (words > 0) removed.push({ what: describe(el), words });
    el.remove();
  }
  return removed;
}

function isForumMagnum(root: Element): boolean {
  // getElementsByClassName: a plain tree walk (a selector query costs much more on big pages).
  if (root.classList.contains(FORUM_MAGNUM_MARK) || root.getElementsByClassName(FORUM_MAGNUM_MARK).length > 0) return true;
  return (root.ownerDocument?.getElementsByClassName(FORUM_MAGNUM_MARK).length ?? 0) > 0;
}

/**
 * Only the class/id pass of stripBoilerplate(): blocks named like boilerplate
 * (comments, newsletter, share...). Used on Readability's output too, because
 * Readability sometimes appends a comment thread (LessWrong) that the page
 * count (the coverage denominator) already leaves out. IN PLACE.
 */
export function stripNamedBoilerplate(root: Element, opts: { keepMajority?: boolean } = {}): RemovedPart[] {
  const removed: RemovedPart[] = removeForumMagnumFurniture(root);
  const total = Math.max(1, countNodeWords(root));
  for (const el of Array.from(root.querySelectorAll("[class], [id]"))) {
    if (el === root || !root.contains(el)) continue;
    const tag = el.localName;
    if (tag === "body" || tag === "html" || tag === "main" || tag === "article") continue;
    // Boilerplate is made of blocks; inline elements with such names are content
    // (e.g. LaTeXML "ltx_lst_comment" = a comment inside a code listing).
    if (INLINE_NAMES.has(tag)) continue;
    const names = classAndId(el);
    const strong = STRONG_BOILERPLATE.test(names);
    const weak = !strong && WEAK_BOILERPLATE.test(names);
    if (!strong && !weak) continue;
    // Checked after the cheap name test: a selector call per element is slow on big pages.
    if (el.closest("pre, code")) continue;
    if (el.querySelector(KEEPS_CONTENT)) continue;
    const words = countNodeWords(el);
    if (weak && words > total * 0.25) continue;
    // Readability turns <h1> into <h2> and <article> into <div>, so the
    // KEEPS_CONTENT test above cannot protect a content wrapper there
    // (vitalik.eth.limo: <div class="markdown-body comment-enabled"> holds the whole post).
    if (opts.keepMajority && words > total * 0.5) continue;
    if (words > 0) removed.push({ what: describe(el), words });
    el.remove();
  }
  return removed;
}

/** Words in the page body minus boilerplate (the coverage denominator), and the biggest parts left out. */
export function pageText(doc: Document): { words: number; removed: RemovedPart[] } {
  if (!doc.body) return { words: 0, removed: [] };
  const clone = doc.body.cloneNode(true) as Element;
  const removed = stripBoilerplate(clone);
  return { words: countNodeWords(clone), removed: removed.sort((a, b) => b.words - a.words) };
}

export function pageWords(doc: Document): number {
  return pageText(doc).words;
}

export type CandidateKind = "readability" | "article" | "main" | "role-main" | "body";

export interface Candidate {
  kind: CandidateKind;
  node: Element;
  words: number;
  images: number;
  linkDensity: number;
  /** Words in hidden parts left out of this candidate. */
  hiddenWords: number;
  /** Readability only: words of whole paragraphs it left out (set by chooseContent). */
  lostParagraphWords?: number;
}

function linkDensity(node: Element, words: number): number {
  if (words === 0) return 1;
  let linkWords = 0;
  for (const a of Array.from(node.querySelectorAll("a"))) {
    if (a.parentElement?.closest("a")) continue;
    linkWords += countWords(visibleText(a));
  }
  return linkWords / words;
}

function makeCandidate(kind: CandidateKind, node: Element, strip: "all" | "named"): Candidate {
  const copy = node.cloneNode(true) as Element;
  const removed = strip === "all" ? stripBoilerplate(copy) : stripNamedBoilerplate(copy, { keepMajority: true });
  // Measure what would really be printed: the same cleaning as the converter.
  const measure = copy.cloneNode(true) as Element;
  prepareContent(measure, emptyReport());
  const words = countNodeWords(measure);
  return {
    kind,
    node: copy,
    words,
    images: measure.querySelectorAll("img").length,
    linkDensity: linkDensity(measure, words),
    hiddenWords: hiddenWordsOf(removed),
  };
}

function largest(doc: Document, selector: string): Element | null {
  let best: Element | null = null;
  let bestLen = -1;
  for (const el of Array.from(doc.querySelectorAll(selector))) {
    const len = (el.textContent ?? "").length;
    if (len > bestLen) {
      best = el;
      bestLen = len;
    }
  }
  return best;
}

/** Within this share of the best word count, a cleaner (semantic) candidate wins. */
export const PREFER_WITHIN = 0.05;

/**
 * Pick the content node: the candidate with the most words that is not
 * obviously boilerplate (link density > 0.5), preferring Readability, then
 * <article>, <main>, [role=main] when they are within 5 % of the best.
 * Readability is skipped when it kept fewer images than another close candidate.
 */
export function chooseContent(
  doc: Document,
  readabilityNode: Element | null,
  preference: CandidateKind[] = ["readability", "article", "main", "role-main", "body"],
): { chosen: Candidate; candidates: Candidate[] } {
  const cands: Candidate[] = [];
  if (readabilityNode) cands.push(makeCandidate("readability", readabilityNode, "named"));
  const article = largest(doc, "article");
  if (article) cands.push(makeCandidate("article", article, "all"));
  const main = doc.querySelector("main");
  if (main) cands.push(makeCandidate("main", main, "all"));
  const roleMain = doc.querySelector("[role=main]");
  if (roleMain && roleMain !== main) cands.push(makeCandidate("role-main", roleMain, "all"));
  if (doc.body) cands.push(makeCandidate("body", doc.body, "all"));

  const usable = cands.filter((c) => c.words > 0 && c.linkDensity <= 0.5);
  const pool = usable.length ? usable : cands;
  if (pool.length === 0) {
    const empty = doc.createElement("div");
    const c: Candidate = { kind: "body", node: empty, words: 0, images: 0, linkDensity: 0, hiddenWords: 0 };
    return { chosen: c, candidates: [c] };
  }
  const best = Math.max(...pool.map((c) => c.words));
  const close = pool.filter((c) => c.words >= best * (1 - PREFER_WITHIN));
  const maxImages = Math.max(...close.map((c) => c.images));
  const ordered = [...close].sort((a, b) => preference.indexOf(a.kind) - preference.indexOf(b.kind));
  // Readability can drop a real paragraph (seen on LessWrong: a <p> with two
  // links and a <br><br>). Being within 5 % of the best word count does not
  // prove nothing was lost, so compare whole paragraphs with the biggest other candidate.
  const readability = close.find((c) => c.kind === "readability");
  const others = close.filter((c) => c.kind !== "readability");
  if (readability && others.length) {
    const ref = others.reduce((a, b) => (b.words > a.words ? b : a));
    readability.lostParagraphWords = paragraphWordsMissing(readability.node, ref.node);
  }
  const chosen =
    ordered.find(
      (c) =>
        !(c.kind === "readability" && (c.images < maxImages || (c.lostParagraphWords ?? 0) >= LOST_PARAGRAPH_WORDS)),
    ) ?? ordered[0];
  return { chosen, candidates: cands };
}

/** A paragraph shorter than this is not checked (captions, bylines, "Share"). */
export const LOST_PARAGRAPH_MIN_WORDS = 8;
/** Readability is not used when it left out this many words of whole paragraphs. */
export const LOST_PARAGRAPH_WORDS = 20;

const normSpace = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Words of the <p> paragraphs of `other` (at least LOST_PARAGRAPH_MIN_WORDS
 * words each) whose text does not appear in `kept`. Whitespace is normalised,
 * so a paragraph that Readability split at a <br><br> still counts as kept.
 */
export function paragraphWordsMissing(kept: Element, other: Element): number {
  const keptParas = new Set<string>();
  for (const p of Array.from(kept.getElementsByTagName("p"))) keptParas.add(normSpace(visibleText(p)));
  let keptText: string | null = null;
  let lost = 0;
  for (const p of Array.from(other.getElementsByTagName("p"))) {
    const t = normSpace(visibleText(p));
    if (keptParas.has(t)) continue;
    const words = countWords(t);
    if (words < LOST_PARAGRAPH_MIN_WORDS) continue;
    keptText ??= normSpace(visibleText(kept));
    if (!keptText.includes(t)) lost += words;
  }
  return lost;
}

function runReadability(doc: Document): { node: Element | null; meta: ReadabilityMeta } {
  const meta: ReadabilityMeta = { title: "", byline: "", siteName: "", publishedTime: "" };
  try {
    const clone = doc.cloneNode(true) as Document;
    // Readability rewrites <div>s into <p>s and loses their class names, so
    // known furniture must go before it runs (it is left out of the page count too).
    if (clone.body) removeForumMagnumFurniture(clone.body);
    const reader = new Readability<Node>(clone, {
      keepClasses: true,
      serializer: (n: Node) => n,
      // Keep every embed (Readability drops non-video iframes otherwise).
      allowedVideoRegex: /./,
      maxElemsToParse: 0,
    });
    const art = reader.parse();
    if (!art) return { node: null, meta };
    meta.title = art.title ?? "";
    meta.byline = art.byline ?? "";
    meta.siteName = art.siteName ?? "";
    meta.publishedTime = art.publishedTime ?? "";
    const node = art.content && (art.content as Node).nodeType === 1 ? (art.content as Element) : null;
    return { node, meta };
  } catch {
    return { node: null, meta };
  }
}

interface ReadabilityMeta {
  title: string;
  byline: string;
  siteName: string;
  publishedTime: string;
}

export function isArxivHtmlUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.hostname === "arxiv.org" || u.hostname.endsWith(".arxiv.org")) && /^\/html\//.test(u.pathname);
  } catch {
    return false;
  }
}

export function isArxivAbsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.hostname === "arxiv.org" || u.hostname.endsWith(".arxiv.org")) && /^\/abs\//.test(u.pathname);
  } catch {
    return false;
  }
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * arXiv HTML pages have no date meta. Their corner note reads
 * "arXiv:2401.05566v3 [cs.CR] 17 Jan 2024" (the date of that version).
 * Returns YYYY-MM-DD or "".
 */
export function arxivWatermarkDate(doc: Document): string {
  const t = (doc.getElementById("watermark-tr")?.textContent ?? "").replace(/\s+/g, " ").trim();
  const m = /\] (\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/.exec(t);
  if (!m) return "";
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  const day = Number(m[1]);
  if (month < 1 || day < 1 || day > 31) return "";
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface GenericExtraction {
  document: PrintDocument;
  /** The chosen content node after cleaning, as converted. */
  contentNode: Element;
  convert: ConvertResult;
  wordsPage: number;
  contentKind: CandidateKind;
  ld: LdArticle | null;
  details: string[];
}

export function extractGeneric(
  doc: Document,
  url: string,
  baseUrl: string,
  opts: { arxiv?: boolean; wordsPage?: number; pageHiddenWords?: number; skipReadability?: boolean } = {},
): GenericExtraction {
  const wordsPage = opts.wordsPage ?? pageWords(doc);
  const ld = readJsonLd(doc);
  const details: string[] = [];

  let chosenNode: Element;
  let kind: CandidateKind;
  let hiddenWords = 0;
  let rmeta: ReadabilityMeta = { title: "", byline: "", siteName: "", publishedTime: "" };
  const ltx = opts.arxiv ? doc.querySelector("article.ltx_document") : null;
  if (ltx) {
    // LaTeXML output is already a clean article; Readability would only damage tables and math.
    chosenNode = ltx.cloneNode(true) as Element;
    // Only the page furniture LaTeXML puts inside the article (table of contents, navigation bar).
    for (const el of Array.from(chosenNode.querySelectorAll("nav, .ltx_page_navbar, .ltx_TOC, footer.ltx_page_footer"))) {
      if (chosenNode.contains(el)) el.remove();
    }
    hiddenWords = removeHidden(chosenNode);
    kind = "article";
    details.push("Content: arXiv HTML article (LaTeXML).");
  } else {
    const r = opts.skipReadability ? { node: null, meta: rmeta } : runReadability(doc);
    if (opts.skipReadability) details.push("Readability skipped: the page is very large or very deeply nested.");
    rmeta = r.meta;
    const { chosen, candidates } = chooseContent(doc, r.node);
    chosenNode = chosen.node;
    // Readability drops hidden parts itself: use the page-level count for it.
    hiddenWords = chosen.kind === "readability" ? (opts.pageHiddenWords ?? 0) : chosen.hiddenWords;
    kind = chosen.kind;
    details.push(
      `Content: ${chosen.kind} (${candidates.map((c) => `${c.kind} ${c.words} words, ${c.images} images`).join("; ")}).`,
    );
    const lost = candidates.find((c) => c.kind === "readability")?.lostParagraphWords ?? 0;
    if (lost > 0) details.push(`Readability left out ${lost} words of whole paragraphs${chosen.kind === "readability" ? "" : ", so it was not used"}.`);
  }

  const convert = convertContent(chosenNode, { baseUrl });
  convert.report.hiddenWords += hiddenWords;

  // ── Metadata ──
  const h1 = textOf(doc.querySelector("h1"));
  let title =
    (opts.arxiv ? textOf(doc.querySelector(".ltx_title_document")) : "") ||
    ld?.headline ||
    metaContent(doc, "og:title", "twitter:title", "citation_title", "dc.title") ||
    rmeta.title ||
    (doc.title ?? "").trim() ||
    h1;
  title = title.replace(/\s+/g, " ").trim();

  let author = "";
  const citationAuthors = metaAll(doc, "citation_author");
  if (ld?.authors.length) author = joinAuthors(ld.authors);
  if (!author) author = cleanAuthor(metaContent(doc, "author", "dc.creator", "parsely-author", "sailthru.author"));
  if (!author && citationAuthors.length) author = joinAuthors(citationAuthors);
  if (!author) author = cleanAuthor(metaContent(doc, "article:author", "twitter:creator"));
  if (!author && opts.arxiv) {
    const names = Array.from(doc.querySelectorAll(".ltx_authors .ltx_personname"))
      .map((n) => (n.firstChild?.textContent ?? n.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 0 && s.length < 120);
    author = joinAuthors(names);
  }
  if (!author) author = cleanAuthor(rmeta.byline);

  const publication =
    metaContent(doc, "og:site_name", "application-name", "citation_journal_title", "citation_conference_title") ||
    ld?.publisher ||
    rmeta.siteName ||
    (opts.arxiv ? "arXiv" : "") ||
    hostLabel(url);

  const date = normalizeDate(
    ld?.datePublished ||
      (opts.arxiv ? arxivWatermarkDate(doc) : "") ||
      metaContent(
        doc,
        "article:published_time",
        "citation_publication_date",
        "citation_date",
        "citation_online_date",
        "dc.date",
        "date",
        "pubdate",
      ) ||
      rmeta.publishedTime ||
      doc.querySelector("time[datetime]")?.getAttribute("datetime") ||
      "",
  );

  const heroRaw = ld?.image || metaContent(doc, "og:image", "twitter:image");
  let heroImage: string | undefined;
  try {
    const u = heroRaw ? new URL(heroRaw, baseUrl) : null;
    if (u && (u.protocol === "https:" || u.protocol === "http:")) heroImage = u.href.replace(/^http:/, "https:");
  } catch {
    heroImage = undefined;
  }

  const document: PrintDocument = {
    url,
    title,
    subtitle: "",
    author,
    publication,
    date,
    elements: convert.elements,
  };
  if (heroImage) document.heroImage = heroImage;
  return { document, contentNode: chosenNode, convert, wordsPage, contentKind: kind, ld, details };
}
