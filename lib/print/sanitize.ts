// Strict HTML sanitizer for Print (SPEC.md §7.4, fidelity rule 6).
// Everything that comes from an outside page passes through here before it
// is stored in a PrintDocument. Allowlist only: no scripts, styles, iframes,
// forms, event handlers, inline style, ids, or javascript:/data: URLs.
// Relative URLs are made absolute against the page URL.

import sanitizeHtml from "sanitize-html";
import { NON_TEXT_TAGS } from "./text";

export const INLINE_TAGS = [
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "br",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "wbr",
] as const;

/** MathML (presentation) kept so equations print (arXiv HTML, Wikipedia...). */
export const MATH_TAGS = [
  "math",
  "semantics",
  "mrow",
  "mi",
  "mo",
  "mn",
  "ms",
  "mtext",
  "mspace",
  "msub",
  "msup",
  "msubsup",
  "munder",
  "mover",
  "munderover",
  "mfrac",
  "msqrt",
  "mroot",
  "mstyle",
  "merror",
  "mpadded",
  "mphantom",
  "menclose",
  "mtable",
  "mtr",
  "mtd",
  "mlabeledtr",
  "mmultiscripts",
  "mprescripts",
  "none",
] as const;

export const BLOCK_TAGS = [
  "p",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "figure",
  "figcaption",
  "img",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "div",
  "dl",
  "dt",
  "dd",
] as const;

// NON_TEXT_TAGS lives in ./text (client-safe, shared with the word counter).
export { NON_TEXT_TAGS };

const MATH_ATTRS = [
  "display",
  "mathvariant",
  "displaystyle",
  "scriptlevel",
  "stretchy",
  "fence",
  "separator",
  "lspace",
  "rspace",
  "accent",
  "accentunder",
  "movablelimits",
  "largeop",
  "symmetric",
  "minsize",
  "maxsize",
  "linethickness",
  "columnalign",
  "rowalign",
  "columnspan",
  "rowspan",
  "notation",
  "width",
  "height",
  "depth",
  "alttext",
];

const LINK_SCHEMES = ["http", "https", "mailto"];

/** Make `raw` absolute against `base`; return "" unless it is http(s) (or mailto when allowed). */
export function resolveUrl(raw: string | undefined | null, base: string, allowMailto = false): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  let u: URL;
  try {
    u = new URL(trimmed, base);
  } catch {
    return "";
  }
  if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  if (allowMailto && u.protocol === "mailto:") return u.href;
  return "";
}

export interface SrcsetCandidate {
  url: string;
  width?: number;
  density?: number;
}

/**
 * Parse a srcset attribute following the HTML spec algorithm, so URLs that
 * contain commas (Substack: ".../w_1456,c_limit,f_webp/...") stay whole.
 * Linear time, no regex backtracking.
 */
export function parseSrcset(srcset: string): SrcsetCandidate[] {
  const out: SrcsetCandidate[] = [];
  const s = srcset;
  const n = s.length;
  let i = 0;
  const isSpace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
  while (i < n) {
    while (i < n && (isSpace(s[i]) || s[i] === ",")) i++;
    if (i >= n) break;
    const start = i;
    while (i < n && !isSpace(s[i])) i++;
    let url = s.slice(start, i);
    let descriptors = "";
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      // Collect descriptors up to the next comma that is not inside parentheses.
      const dStart = i;
      let depth = 0;
      while (i < n) {
        const c = s[i];
        if (c === "(") depth++;
        else if (c === ")") depth = Math.max(0, depth - 1);
        else if (c === "," && depth === 0) break;
        i++;
      }
      descriptors = s.slice(dStart, i).trim();
      if (i < n && s[i] === ",") i++;
    }
    if (!url) continue;
    const cand: SrcsetCandidate = { url };
    for (const d of descriptors.split(/\s+/)) {
      if (/^\d+w$/.test(d)) cand.width = parseInt(d, 10);
      else if (/^\d+(\.\d+)?x$/.test(d)) cand.density = parseFloat(d);
    }
    out.push(cand);
  }
  return out;
}

/** Best candidate: largest width descriptor, else largest density, else the first. */
export function bestFromSrcset(srcset: string | undefined | null): string {
  if (!srcset) return "";
  const cands = parseSrcset(srcset);
  if (cands.length === 0) return "";
  let best = cands[0];
  for (const c of cands) {
    const cw = c.width ?? 0;
    const bw = best.width ?? 0;
    if (cw > bw) best = c;
    else if (cw === bw && (c.density ?? 1) > (best.density ?? 1)) best = c;
  }
  return best.url;
}

const RASTER_DATA_URL = /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i;

/** True for data: URLs that are tiny placeholders (lazy-load stubs, 1x1 gifs). */
export function isPlaceholderDataUrl(src: string): boolean {
  return /^data:/i.test(src) && src.length < 400;
}

export type ImageAttrs = Record<string, string | undefined>;

/**
 * Choose the real image URL from an <img>'s attributes: srcset (best width),
 * lazy-load attributes (data-src, data-srcset, data-lazy-src, data-original),
 * then src. Returns an absolute https URL, a raster data: URL when that is the
 * only real source, or "".
 */
export function pickImageSrc(attrs: ImageAttrs, base: string, extraSrcsets: string[] = []): string {
  const candidates: string[] = [];
  const srcsets = [attrs["srcset"], attrs["data-srcset"], attrs["data-lazy-srcset"], ...extraSrcsets];
  for (const ss of srcsets) {
    const best = bestFromSrcset(ss);
    if (best) candidates.push(best);
  }
  for (const k of ["data-src", "data-lazy-src", "data-original", "data-url", "src"]) {
    const v = attrs[k];
    if (v) candidates.push(v);
  }
  for (const c of candidates) {
    const raw = c.trim();
    if (!raw) continue;
    if (/^data:/i.test(raw)) continue; // try the next (lazy-load stub)
    let abs = resolveUrl(raw, base);
    if (!abs) continue;
    if (abs.startsWith("http://")) abs = "https://" + abs.slice("http://".length);
    return abs;
  }
  // Only data: candidates left: keep a real raster image, never a stub or SVG.
  for (const c of candidates) {
    const raw = c.trim();
    if (RASTER_DATA_URL.test(raw) && !isPlaceholderDataUrl(raw)) return raw;
  }
  return "";
}

/** 1x1 / 2x2 tracking pixels, by their declared size. */
export function isTrackingPixel(attrs: ImageAttrs): boolean {
  const w = parseInt(attrs["width"] ?? "", 10);
  const h = parseInt(attrs["height"] ?? "", 10);
  return Number.isFinite(w) && Number.isFinite(h) && w <= 2 && h <= 2;
}

function baseOptions(baseUrl: string, allowedTags: readonly string[]): sanitizeHtml.IOptions {
  const mathAttrs: Record<string, string[]> = {};
  for (const t of MATH_TAGS) mathAttrs[t] = MATH_ATTRS;
  return {
    allowedTags: [...allowedTags],
    disallowedTagsMode: "discard",
    nonTextTags: [...NON_TEXT_TAGS],
    allowedAttributes: {
      ...mathAttrs,
      "*": ["lang", "dir", "title"],
      a: ["href", "rel", "lang", "dir", "title"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan", "lang", "dir"],
      th: ["colspan", "rowspan", "scope", "lang", "dir"],
      col: ["span"],
      colgroup: ["span"],
      ol: ["start", "reversed", "type"],
      li: ["value"],
      code: ["class"],
      time: ["datetime"],
      data: ["value"],
      abbr: ["title"],
    },
    allowedClasses: { code: ["language-*"] },
    allowedSchemes: LINK_SCHEMES,
    allowedSchemesByTag: { img: ["https", "http"] },
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    allowProtocolRelative: false,
    allowedStyles: {},
    parseStyleAttributes: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = resolveUrl(attribs.href, baseUrl, true);
        const out: sanitizeHtml.Attributes = {};
        if (href) {
          out.href = href;
          out.rel = "noopener noreferrer";
        }
        if (attribs.title) out.title = attribs.title;
        if (attribs.lang) out.lang = attribs.lang;
        if (attribs.dir) out.dir = attribs.dir;
        return { tagName, attribs: out };
      },
      img: (tagName, attribs) => {
        const src = pickImageSrc(attribs, baseUrl);
        const out: sanitizeHtml.Attributes = {};
        // data: URLs never go into sanitized HTML (only into image elements).
        if (src && !src.startsWith("data:")) out.src = src;
        if (attribs.alt) out.alt = attribs.alt;
        if (attribs.title) out.title = attribs.title;
        if (attribs.width && /^\d+$/.test(attribs.width)) out.width = attribs.width;
        if (attribs.height && /^\d+$/.test(attribs.height)) out.height = attribs.height;
        return { tagName, attribs: out };
      },
    },
    exclusiveFilter: (frame) => {
      if (frame.tag === "img") {
        const a = frame.attribs as ImageAttrs;
        return !a.src || isTrackingPixel(a);
      }
      return false;
    },
  };
}

const INLINE_ALLOWED = [...INLINE_TAGS, ...MATH_TAGS];
const BLOCK_ALLOWED = [...INLINE_TAGS, ...MATH_TAGS, ...BLOCK_TAGS];

/** Inline formatting only (for paragraphs, headings, captions). Images are dropped here: the converter lifts them out first. */
export function sanitizeInline(html: string, baseUrl: string): string {
  return sanitizeHtml(html, baseOptions(baseUrl, INLINE_ALLOWED)).trim();
}

/** Inline + block tags (for list items, blockquotes, tables). */
export function sanitizeBlock(html: string, baseUrl: string): string {
  return sanitizeHtml(html, baseOptions(baseUrl, BLOCK_ALLOWED)).trim();
}

/** Escape plain text for safe use inside HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
