// The user's choices on the print page, applied to a document.
// Client-safe pure code. Nothing disappears silently: every embed or image the
// user leaves out is COUNTED, and the words inside them are counted too, so the
// check line can say "Left out by you: 2 embeds, 1 image" and the page check
// can compare the pages with the right number of words.

import { countWords } from "./text";
import type { PrintDocument, PrintElement } from "./types";

export interface PrintOptions {
  /** Leave out every element of type "embed" (videos, posts on X, audio...). */
  excludeEmbeds: boolean;
  /** Image elements whose src is in this set are left out (one by one, by the user). */
  removedImages: ReadonlySet<string>;
}

export interface AppliedOptions {
  /** The elements to print, in order. */
  elements: PrintElement[];
  /** For each printed element, its index in doc.elements. */
  sourceIndex: number[];
  /** Embeds left out by "Leave out videos and embeds". */
  excludedEmbeds: number;
  /** Image elements removed by the user. */
  removedImagesCount: number;
  /** Words of printed text inside what was left out (embed text, image captions). */
  excludedWords: number;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Plain text of a short sanitized inline HTML string (a caption), for word
 * counting only. Tags are dropped (inline tags do not split words); <br> and
 * MathML cells become spaces; common entities are decoded.
 */
export function inlineHtmlText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(?:mtd|mtr|mtable|mlabeledtr)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
      }
      return ENTITIES[code.toLowerCase()] ?? m;
    });
}

const RASTER_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;

/**
 * True when an image address may go into <img src> on the print page: https,
 * or a base64 raster data: URL (the extractor keeps those when they are the
 * only real source). Never javascript:, http:, SVG data or anything else.
 */
export function isPrintableImageSrc(src: string | undefined | null): boolean {
  if (typeof src !== "string" || !src) return false;
  if (RASTER_DATA_URL.test(src)) return true;
  try {
    return new URL(src).protocol === "https:";
  } catch {
    return false;
  }
}

export function applyOptions(doc: Pick<PrintDocument, "elements"> | null | undefined, opts: PrintOptions): AppliedOptions {
  const out: AppliedOptions = { elements: [], sourceIndex: [], excludedEmbeds: 0, removedImagesCount: 0, excludedWords: 0 };
  const list = doc?.elements ?? [];
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (el.type === "embed" && opts.excludeEmbeds) {
      out.excludedEmbeds++;
      if (el.text) out.excludedWords += countWords(el.text);
      continue;
    }
    if (el.type === "image" && opts.removedImages.has(el.src)) {
      out.removedImagesCount++;
      if (el.caption) out.excludedWords += countWords(inlineHtmlText(el.caption));
      continue;
    }
    out.elements.push(el);
    out.sourceIndex.push(i);
  }
  return out;
}
