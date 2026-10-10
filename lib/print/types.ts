// Document model for the Print function (SPEC.md §7.4).
// Server side only. Everything here is plain data (JSON-safe), so it can be
// cached and sent to the print page as-is.
//
// HTML strings in this model are ALWAYS the output of lib/print/sanitize.ts
// (strict allowlist, no scripts, no event handlers, absolute http(s) URLs).

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type EmbedProvider =
  | "youtube"
  | "vimeo"
  | "twitter"
  | "spotify"
  | "soundcloud"
  | "apple-podcasts"
  | "substack"
  | "other";

export type PlaceholderKind =
  | "embed"
  | "image"
  | "unsupported"
  | "iframe"
  | "form"
  | "script-content"
  | "equation";

/** Where a paragraph came from when it was not a real <p> in the source. */
export type ParagraphOrigin =
  | "text" // loose text directly inside a container (e.g. <div>text</div>)
  | "equation" // a display equation (arXiv LaTeXML equation table, block <math>)
  | "figcaption"; // caption of a figure that had no image

export type PrintElement =
  | { type: "paragraph"; html: string; from?: ParagraphOrigin }
  | { type: "heading"; level: HeadingLevel; html: string }
  | { type: "blockquote"; html: string }
  | { type: "pullquote"; html: string }
  | { type: "image"; src: string; caption: string; alt: string }
  | { type: "list"; ordered: boolean; items: string[]; start?: number }
  | { type: "separator" }
  | { type: "code"; language: string; text: string }
  | { type: "table"; html: string }
  | {
      type: "embed";
      provider: EmbedProvider;
      url: string;
      title?: string;
      /** Set when we know the embed is a video or audio (for the placeholder wording). */
      media?: "video" | "audio";
      /** Visible text the embed carried in the page (e.g. the text of a post on X). Printed under the placeholder. */
      text?: string;
    }
  | {
      type: "placeholder";
      kind: PlaceholderKind;
      label: string;
      url?: string;
      /** Characters of source text that this placeholder replaces (0 when none). */
      textLength?: number;
      /** Words of source text that this placeholder replaces (0 when none). */
      words?: number;
    };

export type PrintElementType = PrintElement["type"];

export interface PrintDocument {
  url: string;
  title: string;
  subtitle: string;
  author: string;
  publication: string;
  /** ISO 8601 date or date-time, or "" when unknown. */
  date: string;
  /** Social / cover image of the page (not counted in the image check). */
  heroImage?: string;
  elements: PrintElement[];
}

export interface FidelityCheck {
  /** Words in the selected content area before conversion (visible text, widgets removed on purpose are not counted). */
  wordsFound: number;
  /** Words in the printed elements (placeholder labels not included). */
  wordsPrinted: number;
  /** Words in placeholder labels (counted apart, never as printed text). */
  placeholderWords: number;
  imagesFound: number;
  imagesKept: number;
  tablesFound: number;
  tablesKept: number;
  codeFound: number;
  codeKept: number;
  embedsFound: number;
  embedsPlaceholdered: number;
  /** Widgets removed on purpose (subscribe boxes, share buttons, forms...). */
  widgetsRemoved: number;
  /** Words inside the widgets removed on purpose. */
  widgetWords: number;
  /** Elements we could not print and replaced with a placeholder. */
  skippedUnsupported: number;
  /** Words in hidden parts of the content (collapsed sections, closed pop-ups): not printed, reported. */
  wordsHidden: number;
  /** Coarse page text: words in body minus boilerplate. */
  wordsPage: number;
  /** wordsPrinted / wordsPage (0..1+). */
  coverage: number;
  /** wordsPrinted / wordsFound. */
  ratio: number;
  /** |1 - ratio| <= 0.02 */
  withinTolerance: boolean;
  details: string[];
}

export type PrintWarningCode =
  | "low-coverage"
  | "ratio-out-of-tolerance"
  | "placeholders"
  | "unsupported-content"
  | "images-missing"
  | "paywall"
  | "too-short"
  | "abstract-only"
  | "hidden-content";

export interface PrintWarning {
  code: PrintWarningCode;
  /** Simple English (B1) for the UI. */
  message: string;
}

export type PrintStatus = "ok" | "warning" | "blocked" | "paywalled" | "too-short" | "failed";

export type PrintSource = "substack" | "web" | "arxiv-html";

export interface PrintResult {
  status: PrintStatus;
  /** Present when we could extract something (also for 'paywalled' = free preview, and often 'too-short'). */
  document?: PrintDocument;
  check: FidelityCheck;
  warnings: PrintWarning[];
  /** Simple English (B1) for the UI. */
  message: string;
  source: PrintSource;
}

const PROVIDER_NOUN: Record<EmbedProvider, string> = {
  youtube: "Video",
  vimeo: "Video",
  twitter: "Post on X",
  spotify: "Audio",
  soundcloud: "Audio",
  "apple-podcasts": "Audio",
  substack: "Embedded post",
  other: "Embedded content",
};

/**
 * The visible text for an element that is not printed as itself
 * (embeds and placeholders), so nothing disappears silently.
 * Returns "" for elements that print normally.
 */
export function placeholderText(el: PrintElement): string {
  if (el.type === "embed") {
    const noun =
      el.provider === "other" && el.media === "video"
        ? "Video"
        : el.provider === "other" && el.media === "audio"
          ? "Audio"
          : PROVIDER_NOUN[el.provider];
    return el.url ? `${noun} not printed: ${el.url}` : `${noun} not printed.`;
  }
  if (el.type === "placeholder") {
    return el.url ? `${el.label}: ${el.url}` : el.label;
  }
  return "";
}
