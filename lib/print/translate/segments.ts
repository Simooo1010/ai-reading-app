// Translatable parts of a PrintDocument (SPEC.md §7.4, Italian).
// Server side only. Pure functions, no I/O.
//
// collectSegments() lists every string a reader sees as prose: title,
// subtitle, paragraphs, headings, quotes, list items, image captions, tables
// and the text of embeds. Code, separators, placeholders, display equations,
// bare URLs and strings with no letters are never sent (they print as they
// are). applyTranslations() writes the results into a DEEP COPY with the same
// elements in the same order and of the same types (structure guarantee), and
// sanitizes every translated HTML string again.

import { sanitizeBlock, sanitizeInline } from "../sanitize";
import type { PrintDocument, PrintElement } from "../types";
import { isSaneLength, maskedWords, maskHtml, MARK_CLOSE, MARK_OPEN, unmaskHtml, type MaskedHtml } from "./mask";

/** plain: text, not HTML. inline / block: HTML sanitized with sanitizeInline / sanitizeBlock. */
export type SegmentKind = "plain" | "inline" | "block";

export type SegmentRef =
  | { where: "title" }
  | { where: "subtitle" }
  | { where: "element"; index: number; key: "html" | "caption" | "text" }
  | { where: "item"; index: number; item: number };

export interface Segment {
  ref: SegmentRef;
  kind: SegmentKind;
  /** The original (English) string. */
  source: string;
  /** What the translator gets. */
  text: string;
  /** Markup table for HTML segments (null for plain text). */
  masked: MaskedHtml | null;
}

const LETTER = new RegExp("\\p{L}", "u");
const ONLY_URL = /^(?:https?:\/\/|www\.)\S+$|^\S+@\S+\.\S+$/i;

/** True when the visible words are worth translating (letters, not just a link or an address). */
export function isTranslatable(words: string): boolean {
  return LETTER.test(words) && !ONLY_URL.test(words);
}

function makeSegment(ref: SegmentRef, kind: SegmentKind, source: string): Segment | null {
  if (!source.trim()) return null;
  if (kind === "plain") {
    const words = source.replace(/\s+/g, " ").trim();
    return isTranslatable(words) ? { ref, kind, source, text: source, masked: null } : null;
  }
  const masked = maskHtml(source);
  return isTranslatable(maskedWords(masked.text)) ? { ref, kind, source, text: masked.text, masked } : null;
}

/** Every translatable string of the document, in reading order. */
export function collectSegments(doc: PrintDocument): Segment[] {
  const out: Segment[] = [];
  const add = (seg: Segment | null) => {
    if (seg) out.push(seg);
  };
  add(makeSegment({ where: "title" }, "plain", doc.title));
  add(makeSegment({ where: "subtitle" }, "plain", doc.subtitle));
  doc.elements.forEach((el, index) => {
    switch (el.type) {
      case "paragraph":
        if (el.from !== "equation") add(makeSegment({ where: "element", index, key: "html" }, "inline", el.html));
        break;
      case "heading":
      case "pullquote":
        add(makeSegment({ where: "element", index, key: "html" }, "inline", el.html));
        break;
      case "blockquote":
      case "table":
        add(makeSegment({ where: "element", index, key: "html" }, "block", el.html));
        break;
      case "list":
        el.items.forEach((html, item) => add(makeSegment({ where: "item", index, item }, "block", html)));
        break;
      case "image":
        add(makeSegment({ where: "element", index, key: "caption" }, "inline", el.caption));
        break;
      case "embed":
        if (el.text) add(makeSegment({ where: "element", index, key: "text" }, "plain", el.text));
        break;
      case "code":
      case "separator":
      case "placeholder":
        break;
    }
  });
  return out;
}

/**
 * The final string for a segment from a translator's answer, or null when the
 * answer cannot be used (markers lost, empty or absurd length, nothing left
 * after sanitizing). `baseUrl` is the document URL (for the sanitizer).
 */
export function finalizeSegment(seg: Segment, translated: string, baseUrl: string): string | null {
  if (typeof translated !== "string" || !isSaneLength(seg.text, translated)) return null;
  if (seg.kind === "plain") {
    if (translated.includes(MARK_OPEN) || translated.includes(MARK_CLOSE)) return null;
    return translated.trim();
  }
  const html = unmaskHtml(seg.masked as MaskedHtml, translated.trim());
  if (html === null) return null;
  const clean = seg.kind === "inline" ? sanitizeInline(html, baseUrl) : sanitizeBlock(html, baseUrl);
  return clean ? clean : null;
}

function setElementField(el: PrintElement, key: "html" | "caption" | "text", value: string): void {
  if (key === "html" && "html" in el) el.html = value;
  else if (key === "caption" && el.type === "image") el.caption = value;
  else if (key === "text" && el.type === "embed") el.text = value;
}

/**
 * A deep copy of `doc` with the translations in place. `translations[i]`
 * belongs to `segments[i]`; null (or an unusable answer) keeps the English.
 */
export function applyTranslations(
  doc: PrintDocument,
  segments: readonly Segment[],
  translations: readonly (string | null)[],
): { document: PrintDocument; translated: number } {
  const copy = structuredClone(doc);
  let translated = 0;
  segments.forEach((seg, i) => {
    const raw = translations[i];
    if (raw == null) return;
    const value = finalizeSegment(seg, raw, doc.url);
    if (value === null) return;
    translated++;
    const ref = seg.ref;
    if (ref.where === "title") copy.title = value;
    else if (ref.where === "subtitle") copy.subtitle = value;
    else if (ref.where === "item") {
      const el = copy.elements[ref.index];
      if (el.type === "list") el.items[ref.item] = value;
    } else setElementField(copy.elements[ref.index], ref.key, value);
  });
  return { document: copy, translated };
}
