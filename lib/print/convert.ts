// ONE shared DOM-to-elements walker, used by the Substack path and the
// generic path (SPEC.md §7.4). It walks a content node in document order and
// produces PrintElements. Rules:
// - <p> becomes one paragraph. Paragraphs are NEVER merged. Only truly empty
//   paragraphs (no words, no media, no math) are skipped.
// - Headings keep inline links and formatting.
// - Nothing is dropped silently: widgets removed on purpose are counted,
//   unknown elements with text become an 'unsupported' placeholder, media we
//   cannot print become embed/placeholder elements with their URL.

import { hasClass } from "./dom";
import { type ConvertReport, countNodeWords, countWords, emptyReport, visibleText } from "./fidelity";
import { foreignObjectsOf } from "./text";
import {
  escapeHtml,
  INLINE_TAGS,
  isPlaceholderDataUrl,
  isTrackingPixel,
  pickImageSrc,
  resolveUrl,
  sanitizeBlock,
  sanitizeInline,
  type ImageAttrs,
} from "./sanitize";
import type { EmbedProvider, HeadingLevel, PrintElement } from "./types";

export interface ConvertOptions {
  baseUrl: string;
  /** Extra CSS selectors for widgets removed on purpose (counted as 'removed-widget'). */
  widgetSelectors?: string[];
}

export interface ConvertResult {
  elements: PrintElement[];
  report: ConvertReport;
  /** Visible words in the content node after widgets were removed (before conversion). */
  wordsFound: number;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Removed silently: never visible text. */
const INVISIBLE_SELECTOR = "script, style, template, link, meta, base, head, title, annotation, annotation-xml";

/** Removed on purpose and counted (forms, buttons, navigation). */
const DEFAULT_WIDGETS = [
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "dialog",
  "nav",
  "[role=navigation]",
  "[role=search]",
];

const EMBED_SELECTOR = [
  "iframe",
  "video",
  "audio",
  "embed",
  "object",
  "lite-youtube",
  "lite-vimeo",
  "blockquote.twitter-tweet",
  "blockquote.instagram-media",
  "blockquote.tiktok-embed",
  "div.tweet",
  ".embedded-post-wrap",
  ".youtube-wrap",
].join(", ");

/** Things a paragraph/heading cannot print inline and that we lift out as their own elements. */
const MEDIA_SELECTOR = `img, picture, svg, canvas, ${EMBED_SELECTOR}`;

const BLOCK_OR_MEDIA_SELECTOR = [
  "p", "div", "section", "article", "main", "header", "footer", "aside", "nav", "ul", "ol", "li", "dl", "dt", "dd",
  "table", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "figure", "figcaption", "hr", "details",
  "summary", "address", "center", "fieldset", "menu", "math[display=block]", MEDIA_SELECTOR,
].join(", ");

const INLINE_SET = new Set<string>([
  ...INLINE_TAGS,
  "math", "font", "label", "nobr", "tt", "big", "strike", "acronym", "ruby", "rt", "rp", "output", "slot",
]);

const CONTAINER_SET = new Set<string>([
  "div", "section", "article", "main", "header", "footer", "aside", "center", "hgroup", "address", "details",
  "summary", "fieldset", "legend", "body", "form", "search", "li", "dd", "dt", "tbody", "thead", "tfoot", "tr", "td",
  "th", "caption", "colgroup", "col",
  // Inline tags that wrap blocks (e.g. <a><div>..</div></a>) are walked as containers.
  ...INLINE_SET,
]);

const EQUATION_TABLE = "table.ltx_equation, table.ltx_equationgroup, table.ltx_eqn_table";

function tagOf(el: Element): string {
  return el.localName.toLowerCase();
}

function isCustomElement(tag: string): boolean {
  return tag.includes("-");
}

/** Top-level matches only (not nested inside another match within `root`). */
function topLevel(root: Element, selector: string): Element[] {
  const all = Array.from(root.querySelectorAll(selector));
  return all.filter((el) => {
    let p = el.parentElement;
    while (p && p !== root) {
      if (p.matches(selector)) return false;
      p = p.parentElement;
    }
    return true;
  });
}

function attrsOf(el: Element): ImageAttrs {
  const out: ImageAttrs = {};
  for (const a of Array.from(el.attributes)) out[a.name.toLowerCase()] = a.value;
  return out;
}

function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parseDataAttrs(el: Element): Record<string, unknown> {
  const raw = el.getAttribute("data-attrs");
  if (!raw || raw.length > 20_000) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ─── Embeds ──────────────────────────────────────────────────────────

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

export function detectEmbedProvider(url: string): EmbedProvider {
  const h = hostOf(url);
  if (!h) return "other";
  if (hostIs(h, "youtube.com") || hostIs(h, "youtube-nocookie.com") || h === "youtu.be") return "youtube";
  if (hostIs(h, "vimeo.com")) return "vimeo";
  if (hostIs(h, "twitter.com") || hostIs(h, "x.com") || hostIs(h, "twimg.com")) return "twitter";
  if (hostIs(h, "spotify.com")) return "spotify";
  if (hostIs(h, "soundcloud.com")) return "soundcloud";
  if (hostIs(h, "podcasts.apple.com") || hostIs(h, "embed.podcasts.apple.com")) return "apple-podcasts";
  if (hostIs(h, "substack.com")) return "substack";
  return "other";
}

/** Turn embed-only URLs (YouTube, Spotify, Apple Podcasts players) into the normal page a reader can open. */
function canonicalEmbedUrl(url: string, provider: EmbedProvider): string {
  try {
    const u = new URL(url);
    if (provider === "spotify" && u.hostname === "open.spotify.com" && u.pathname.startsWith("/embed/")) {
      return `https://open.spotify.com${u.pathname.slice("/embed".length)}`;
    }
    if (provider === "apple-podcasts" && u.hostname === "embed.podcasts.apple.com") {
      return `https://podcasts.apple.com${u.pathname}${u.search}`;
    }
    if (provider !== "youtube") return url;
    const m = u.pathname.match(/^\/(?:embed|v|shorts)\/([A-Za-z0-9_-]{6,20})/);
    if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
  } catch {
    // keep as is
  }
  return url;
}

// ─── The walker ──────────────────────────────────────────────────────

class Walker {
  readonly out: PrintElement[] = [];
  readonly report: ConvertReport = emptyReport();

  constructor(private readonly baseUrl: string) {}

  inline(html: string): string {
    return sanitizeInline(html, this.baseUrl);
  }

  block(html: string): string {
    return sanitizeBlock(html, this.baseUrl);
  }

  walkChildren(parent: Element, out: PrintElement[] = this.out): void {
    let run: Node[] = [];
    const flush = () => {
      if (run.length) this.emitInlineRun(run, out);
      run = [];
    };
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === TEXT_NODE) {
        run.push(child);
        continue;
      }
      if (child.nodeType !== ELEMENT_NODE) continue;
      const el = child as Element;
      if (this.isPureInline(el)) {
        run.push(el);
        continue;
      }
      flush();
      this.handle(el, out);
    }
    flush();
  }

  isPureInline(el: Element): boolean {
    const tag = tagOf(el);
    if (tag === "math") return el.getAttribute("display") !== "block";
    if (!INLINE_SET.has(tag) && !isCustomElement(tag)) return false;
    if (hasClass(el, "footnote", "tweet", "embedded-post-wrap", "youtube-wrap", "latex-rendered")) return false;
    return el.querySelector(BLOCK_OR_MEDIA_SELECTOR) === null;
  }

  /** Loose inline content directly inside a container becomes one paragraph (from: 'text'). */
  emitInlineRun(nodes: Node[], out: PrintElement[]): void {
    let html = "";
    let words = 0;
    let hasMath = false;
    for (const n of nodes) {
      if (n.nodeType === TEXT_NODE) {
        const t = n.nodeValue ?? "";
        html += escapeHtml(t);
        words += countWords(t);
      } else {
        const el = n as Element;
        html += el.outerHTML;
        words += countNodeWords(el);
        if (tagOf(el) === "math" || el.querySelector("math")) hasMath = true;
      }
    }
    if (words === 0 && !hasMath) return;
    const clean = this.inline(html);
    if (clean) out.push({ type: "paragraph", html: clean, from: "text" });
  }

  handle(el: Element, out: PrintElement[]): void {
    const tag = tagOf(el);

    // Class-based special cases first (Substack and common embed wrappers).
    if (hasClass(el, "footnote") && el.querySelector(".footnote-content")) return this.footnote(el, out);
    if (isImageObject(el)) return this.image(el, "", out);
    if (el.matches(EMBED_SELECTOR)) return this.embed(el, out);
    if (hasClass(el, "latex-rendered")) return this.latex(el, out);
    if (tag !== "figure" && el.matches(".captioned-image-container, .wp-caption") && el.querySelector("img")) {
      return this.figure(el, out);
    }

    switch (tag) {
      case "p":
        return this.textBlock(el, out, (html) => ({ type: "paragraph", html }));
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = parseInt(tag[1], 10) as HeadingLevel;
        return this.textBlock(el, out, (html) => ({ type: "heading", level, html }));
      }
      case "figcaption":
        return this.textBlock(el, out, (html) => ({ type: "paragraph", html, from: "figcaption" }));
      case "blockquote":
        return this.blockquote(el, out);
      case "ul":
      case "ol":
      case "menu":
        return this.list(el, out);
      case "dl":
        return this.definitionList(el, out);
      case "pre":
        return this.code(el, out);
      case "table":
        return this.table(el, out);
      case "hr":
        out.push({ type: "separator" });
        return;
      case "img":
        return this.image(el, "", out);
      case "picture": {
        const img = el.querySelector("img");
        if (img) return this.image(img, "", out);
        return;
      }
      case "figure":
        return this.figure(el, out);
      case "math":
        // Display equation (block). Inline math stays inside its paragraph.
        out.push({ type: "paragraph", html: this.inline(el.outerHTML), from: "equation" });
        return;
      case "svg":
        return this.svg(el, out);
      case "canvas":
        this.report.details.push("A chart or drawing (canvas) was not printed.");
        out.push({ type: "placeholder", kind: "image", label: "Chart or drawing not printed", textLength: 0, words: 0 });
        return;
      case "br":
      case "wbr":
        return;
    }

    if (CONTAINER_SET.has(tag) || isCustomElement(tag)) {
      this.walkChildren(el, out);
      return;
    }

    // Unknown element.
    const text = normalizeSpace(visibleText(el));
    const words = countWords(text);
    if (words > 0) {
      this.report.skippedUnsupported++;
      this.report.unsupportedWords += words;
      this.report.details.push(`Not printed: <${tag}> with ${words} words.`);
      out.push({
        type: "placeholder",
        kind: "unsupported",
        label: `Part of the page not printed (${words} word${words === 1 ? "" : "s"})`,
        textLength: text.length,
        words,
      });
      return;
    }
    if (el.querySelector(MEDIA_SELECTOR)) this.walkChildren(el, out);
  }

  /** Paragraph / heading / caption: inline HTML kept, media lifted out in order. */
  textBlock(el: Element, out: PrintElement[], make: (html: string) => PrintElement): void {
    const media = topLevel(el, MEDIA_SELECTOR);
    const words = countNodeWords(el);
    const hasMath = el.querySelector("math") !== null;
    const hasText = words > 0 || hasMath;
    let mediaFirst = false;
    if (media.length && hasText) mediaFirst = countWords(textBefore(el, media[0])) === 0;
    const mediaOut: PrintElement[] = [];
    for (const m of media) this.handle(m, mediaOut);
    if (mediaFirst) out.push(...mediaOut);
    if (hasText) {
      const html = this.inline(el.innerHTML);
      if (html) out.push(make(html));
    }
    if (!mediaFirst) out.push(...mediaOut);
  }

  liftEmbeds(el: Element, out: PrintElement[]): void {
    for (const m of topLevel(el, `${EMBED_SELECTOR}, svg, canvas`)) this.handle(m, out);
  }

  blockquote(el: Element, out: PrintElement[]): void {
    if (hasClass(el, "pullquote", "pull-quote")) {
      const html = this.block(el.innerHTML);
      if (html) out.push({ type: "pullquote", html });
      this.liftEmbeds(el, out);
      return;
    }
    const after: PrintElement[] = [];
    this.liftEmbeds(el, after);
    if (countNodeWords(el) > 0 || el.querySelector("img, math")) {
      const html = this.block(el.innerHTML);
      if (html) out.push({ type: "blockquote", html });
    }
    out.push(...after);
  }

  list(el: Element, out: PrintElement[]): void {
    const items: string[] = [];
    const after: PrintElement[] = [];
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === TEXT_NODE) {
        const t = child.nodeValue ?? "";
        if (countWords(t) > 0) items.push(escapeHtml(t.trim()));
        continue;
      }
      if (child.nodeType !== ELEMENT_NODE) continue;
      const c = child as Element;
      this.liftEmbeds(c, after);
      const inner = tagOf(c) === "li" ? c.innerHTML : c.outerHTML;
      if (countNodeWords(c) === 0 && !c.querySelector("img, math")) continue;
      const html = this.block(inner);
      if (html) items.push(html);
    }
    if (items.length) {
      const ordered = tagOf(el) === "ol";
      const startAttr = parseInt(el.getAttribute("start") ?? "", 10);
      const list: PrintElement = { type: "list", ordered, items };
      if (ordered && Number.isFinite(startAttr) && startAttr !== 1) list.start = startAttr;
      out.push(list);
    }
    out.push(...after);
  }

  definitionList(el: Element, out: PrintElement[]): void {
    for (const c of Array.from(el.children)) {
      const tag = tagOf(c);
      if (tag === "dt" && c.querySelector(BLOCK_OR_MEDIA_SELECTOR) === null) {
        if (countNodeWords(c) > 0) out.push({ type: "paragraph", html: `<strong>${this.inline(c.innerHTML)}</strong>`, from: "text" });
      } else {
        this.walkChildren(c, out);
      }
    }
  }

  code(el: Element, out: PrintElement[]): void {
    const code = el.querySelector("code");
    const classes = `${code?.getAttribute("class") ?? ""} ${el.getAttribute("class") ?? ""}`;
    const m = classes.match(/(?:^|\s)(?:language|lang)-([A-Za-z0-9_+#.-]{1,40})/);
    const language = m ? m[1] : (el.getAttribute("data-language") ?? code?.getAttribute("data-language") ?? "");
    const text = visibleText(el, "\n").replace(/^\n+/, "").replace(/\s+$/, "");
    if (!text.trim()) return;
    out.push({ type: "code", language: language.slice(0, 40), text });
  }

  table(el: Element, out: PrintElement[]): void {
    if (isEmptyTable(el)) return; // spacing tables (LaTeXML, old layouts): nothing to print
    if (el.matches(EQUATION_TABLE)) {
      for (const row of Array.from(el.querySelectorAll("tr"))) {
        const cells = Array.from(row.children).filter((c) => c.localName === "td" || c.localName === "th");
        // A diagram typeset as an equation (LaTeXML "ltx_markedasmath" <object>,
        // or an <img>) cannot go into the inline HTML: print it as an image after the line.
        const graphics: Element[] = [];
        for (const c of cells) {
          for (const m of Array.from(c.querySelectorAll("img, object, embed"))) {
            if (tagOf(m) === "img" || isImageObject(m)) {
              graphics.push(m);
              m.remove();
            }
          }
        }
        const html = cells
          .map((c) => this.inline(c.innerHTML))
          .filter(Boolean)
          .join(" ");
        if (html) out.push({ type: "paragraph", html, from: "equation" });
        for (const g of graphics) this.image(g, "", out);
      }
      return;
    }
    if (isLayoutTable(el)) {
      for (const cell of layoutCells(el)) this.walkChildren(cell, out);
      return;
    }
    const after: PrintElement[] = [];
    this.liftEmbeds(el, after);
    const html = this.block(el.outerHTML);
    if (html) out.push({ type: "table", html });
    out.push(...after);
  }

  image(img: Element, caption: string, out: PrintElement[]): void {
    if (tagOf(img) !== "img") {
      // <object data="fig.svg" type="image/svg+xml"> (arXiv HTML figures) and <embed type="image/...">.
      let src = resolveUrl(img.getAttribute("data") || img.getAttribute("src"), this.baseUrl);
      if (src.startsWith("http://")) src = "https://" + src.slice("http://".length);
      if (!src) {
        out.push({ type: "placeholder", kind: "image", label: "Image not printed (no usable address)", textLength: 0, words: 0 });
        this.report.details.push("An image had no usable address.");
        return;
      }
      out.push({ type: "image", src, caption, alt: normalizeSpace(img.getAttribute("aria-label") ?? img.getAttribute("title") ?? "") });
      return;
    }
    const attrs = attrsOf(img);
    if (isTrackingPixel(attrs)) return; // counted as skipped in prepare()
    const extra: string[] = [];
    const parent = img.parentElement;
    if (parent && tagOf(parent) === "picture") {
      for (const s of Array.from(parent.querySelectorAll("source[srcset]"))) {
        const ss = s.getAttribute("srcset");
        if (ss) extra.push(ss);
      }
    }
    const src = pickImageSrc(attrs, this.baseUrl, attrs["srcset"] ? [] : extra);
    if (!src) {
      out.push({ type: "placeholder", kind: "image", label: "Image not printed (no usable address)", textLength: 0, words: 0 });
      this.report.details.push("An image had no usable address.");
      return;
    }
    out.push({ type: "image", src, caption, alt: normalizeSpace(attrs["alt"] ?? "") });
  }

  figure(el: Element, out: PrintElement[]): void {
    const captionEls = topLevel(el, "figcaption, .image-caption, .wp-caption-text");
    const imgs = Array.from(el.querySelectorAll("img, object, embed")).filter(
      (i) => (tagOf(i) === "img" && !insideMedia(i, el)) || isImageObject(i),
    );
    const captionWords = captionEls.reduce((n, c) => n + countNodeWords(c), 0);
    const otherWords = countNodeWords(el) - captionWords;
    const complex = Array.from(el.querySelectorAll(`table, pre, blockquote, ul, ol, ${EMBED_SELECTOR}, svg, canvas`)).some(
      (c) => !isImageObject(c) && !(tagOf(c) === "svg" && c.closest("object")),
    );
    if (imgs.length > 0 && otherWords === 0 && !complex) {
      const caption = captionEls.map((c) => this.inline(c.innerHTML)).filter(Boolean).join(" ");
      // Media inside the caption itself would be lost: lift it.
      const capMedia: PrintElement[] = [];
      for (const c of captionEls) for (const m of topLevel(c, MEDIA_SELECTOR)) this.handle(m, capMedia);
      const inCaption = new Set<Element>(captionEls.flatMap((c) => Array.from(c.querySelectorAll("img"))));
      const real = imgs.filter((i) => !inCaption.has(i));
      real.forEach((img, i) => this.image(img, i === real.length - 1 ? caption : "", out));
      out.push(...capMedia);
      return;
    }
    this.walkChildren(el, out);
  }

  embed(el: Element, out: PrintElement[]): void {
    const tag = tagOf(el);
    const data = parseDataAttrs(el);
    let raw = "";
    let title = el.getAttribute("title") ?? "";
    if (tag === "iframe" || tag === "embed") raw = el.getAttribute("src") || el.getAttribute("data-src") || "";
    else if (tag === "video" || tag === "audio")
      raw = el.getAttribute("src") || el.querySelector("source[src]")?.getAttribute("src") || "";
    else if (tag === "object") raw = el.getAttribute("data") || "";
    else if (tag === "lite-youtube") {
      const id = el.getAttribute("videoid");
      if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) raw = `https://www.youtube.com/watch?v=${id}`;
    } else if (tag === "lite-vimeo") {
      const id = el.getAttribute("videoid");
      if (id && /^\d{1,15}$/.test(id)) raw = `https://vimeo.com/${id}`;
    } else if (hasClass(el, "youtube-wrap")) {
      const iframe = el.querySelector("iframe");
      raw = iframe?.getAttribute("src") || "";
      const id = typeof data.videoId === "string" ? data.videoId : "";
      if (!raw && /^[A-Za-z0-9_-]{6,20}$/.test(id)) raw = `https://www.youtube.com/watch?v=${id}`;
    } else if (tag === "blockquote" || hasClass(el, "tweet")) {
      const links = Array.from(el.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") ?? "");
      raw =
        (typeof data.url === "string" ? data.url : "") ||
        links.filter((h) => /\/status(es)?\/\d+/.test(h)).pop() ||
        links.pop() ||
        "";
    } else if (hasClass(el, "embedded-post-wrap")) {
      raw = (typeof data.url === "string" ? data.url : "") || el.querySelector("a[href]")?.getAttribute("href") || "";
      if (!title && typeof data.title === "string") title = data.title;
    }
    let url = resolveUrl(raw, this.baseUrl);
    let provider: EmbedProvider = detectEmbedProvider(url);
    if (tag === "blockquote" && hasClass(el, "twitter-tweet")) provider = "twitter";
    if (hasClass(el, "tweet")) provider = "twitter";
    if (hasClass(el, "youtube-wrap")) provider = "youtube";
    if (hasClass(el, "embedded-post-wrap") && provider === "other" && url) provider = "substack";
    url = canonicalEmbedUrl(url, provider);
    const text = normalizeSpace(visibleText(el));
    const embed: PrintElement = { type: "embed", provider, url };
    const media = tag === "video" || provider === "youtube" || provider === "vimeo" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
      ? "video"
      : tag === "audio" || provider === "spotify" || provider === "soundcloud" || provider === "apple-podcasts" || /\.(mp3|m4a|ogg|wav)(\?|$)/i.test(url)
        ? "audio"
        : undefined;
    if (media) embed.media = media;
    if (title) embed.title = normalizeSpace(title).slice(0, 300);
    if (countWords(text) > 0) embed.text = text;
    out.push(embed);
  }

  footnote(el: Element, out: PrintElement[]): void {
    const numEl = el.querySelector(".footnote-number");
    const num = numEl ? normalizeSpace(numEl.textContent ?? "") : "";
    const content = el.querySelector(".footnote-content");
    const inner: PrintElement[] = [];
    if (content) this.walkChildren(content, inner);
    // Text outside number and content (rare) must not vanish.
    for (const c of Array.from(el.children)) {
      if (c === numEl || c === content) continue;
      this.handle(c, inner);
    }
    const mark = num ? `<sup>${escapeHtml(num)}</sup> ` : "";
    const first = inner[0];
    if (mark && first && first.type === "paragraph") {
      inner[0] = { ...first, html: mark + first.html };
    } else if (mark) {
      inner.unshift({ type: "paragraph", html: mark.trim(), from: "text" });
    }
    out.push(...inner);
  }

  latex(el: Element, out: PrintElement[]): void {
    const data = parseDataAttrs(el);
    const expr = typeof data.persistentExpression === "string" ? data.persistentExpression : "";
    const words = countNodeWords(el);
    if (words > 0 || el.querySelector("math")) {
      // Server-rendered math is present: print it as an equation paragraph.
      const html = this.inline(el.innerHTML);
      if (html) {
        out.push({ type: "paragraph", html, from: "equation" });
        return;
      }
    }
    this.report.details.push("An equation was shown as LaTeX source.");
    out.push({
      type: "placeholder",
      kind: "equation",
      label: expr ? `Equation not printed (LaTeX: ${normalizeSpace(expr).slice(0, 500)})` : "Equation not printed",
      textLength: 0,
      words: 0,
    });
  }

  svg(el: Element, out: PrintElement[]): void {
    // HTML inside the drawing (arXiv "ltx_picture" boxes with prompts and
    // transcripts): print it as normal content, in document order.
    for (const fo of foreignObjectsOf(el)) this.walkChildren(fo, out);
    const textWords = Array.from(el.querySelectorAll("text")).reduce((n, t) => n + countWords(t.textContent ?? ""), 0);
    if (textWords > 0) {
      this.report.details.push(`A drawing (svg) with ${textWords} words of labels was not printed.`);
      out.push({ type: "placeholder", kind: "image", label: "Drawing not printed", textLength: 0, words: 0 });
    }
  }
}

const IMAGE_FILE = /\.(svg|png|jpe?g|gif|webp|avif)(\?[^#]*)?(#.*)?$/i;

/** <object>/<embed> that shows an image (arXiv HTML uses <object data="x.svg" type="image/svg+xml">). */
export function isImageObject(el: Element): boolean {
  const tag = tagOf(el);
  if (tag !== "object" && tag !== "embed") return false;
  const type = (el.getAttribute("type") ?? "").toLowerCase();
  if (type.startsWith("image/")) return true;
  const url = el.getAttribute(tag === "object" ? "data" : "src") ?? "";
  return IMAGE_FILE.test(url.trim());
}

/** True when `el` sits inside media fallback content (video/audio/iframe/object/canvas) below `stop`. */
function insideMedia(el: Element, stop: Element | null = null): boolean {
  let p = el.parentElement;
  while (p && p !== stop) {
    const t = tagOf(p);
    // HTML inside an svg <foreignObject> is printed (see Walker.svg), so it is not fallback content.
    if (t === "foreignobject") return false;
    if (t === "video" || t === "audio" || t === "iframe" || t === "object" || t === "canvas" || t === "svg") return true;
    p = p.parentElement;
  }
  return false;
}

/** Text in `root` before `target` (document order). */
function textBefore(root: Element, target: Element): string {
  const doc = root.ownerDocument;
  const range = doc.createRange();
  range.setStart(root, 0);
  range.setEndBefore(target);
  return range.toString();
}

/** True when `table` sits inside another table that the walker does not open up (only layout tables are walked). */
function insideNonLayoutTable(table: Element, root: Element): boolean {
  let p = table.parentElement?.closest("table");
  while (p && root.contains(p)) {
    if (!isLayoutTable(p)) return true;
    p = p.parentElement?.closest("table");
  }
  return false;
}

/** A table with no words and no images or math. */
export function isEmptyTable(table: Element): boolean {
  return countNodeWords(table) === 0 && table.querySelector("img, math, object, svg") === null;
}

/** Tables used for page layout (one or two columns of blocks), not data. */
export function isLayoutTable(table: Element): boolean {
  const role = table.getAttribute("role");
  if (role === "presentation" || role === "none") return true;
  if (table.querySelector("th")) return false;
  const rows = Array.from(table.querySelectorAll("tr")).filter((r) => r.closest("table") === table);
  const maxCols = rows.reduce((m, r) => Math.max(m, r.children.length), 0);
  if (maxCols > 2) return false;
  return Array.from(table.querySelectorAll("td")).some(
    (td) => td.closest("table") === table && td.querySelector("p, h1, h2, h3, h4, h5, h6, ul, ol, figure, table, blockquote, pre") !== null,
  );
}

function layoutCells(table: Element): Element[] {
  return Array.from(table.querySelectorAll("td, th")).filter((c) => c.closest("table") === table);
}

/**
 * Remove parts that are not visible on the page: [hidden], inline
 * display:none / visibility:hidden, closed <dialog> pop-ups. Returns their words.
 * (Closed <details> are kept: their text is real content a reader opens.)
 */
export function removeHidden(root: Element): number {
  let words = 0;
  const hidden = Array.from(root.querySelectorAll("[hidden], [style], dialog:not([open])")).filter((el) => {
    if (el.hasAttribute("hidden") || tagOf(el) === "dialog") return true;
    const style = (el.getAttribute("style") ?? "").toLowerCase().replace(/\s+/g, "");
    return style.includes("display:none") || style.includes("visibility:hidden");
  });
  for (const el of hidden) {
    if (!root.contains(el)) continue;
    words += countNodeWords(el);
    el.remove();
  }
  return words;
}

/** Short description of an element for the report: tag.class1.class2 */
function describe(el: Element): string {
  const cls = Array.from(el.classList).slice(0, 3).join(".");
  return `<${tagOf(el)}${cls ? "." + cls : ""}>`.slice(0, 80);
}

/** A <form> that wraps real content (old ASP.NET pages wrap the whole page in one). */
export function isContentForm(form: Element): boolean {
  return form.querySelector("p, h1, h2, h3, article, main") !== null && countNodeWords(form) >= 100;
}

/**
 * Clean the content node in place before counting and converting:
 * invisible parts removed, hidden parts removed (reported), widgets removed
 * (counted), emoji images turned into their text, lazy images from <noscript>
 * recovered. Returns the counts it made.
 */
/**
 * The whole text of a page control that is not part of the article. Exact,
 * case-insensitive matches only: real prose is never touched.
 */
export const CONTROL_LABELS = new Set([
  "copy citation",
  "download citation",
  "cite",
  "share",
  "print this page",
  "save",
  "bookmark",
  "email",
]);

const CONTROL_CANDIDATES = "a, button, [role=button], div, span, p, label, summary";
/** Never touched: a heading, a table cell, a caption or code with that text is content. */
const KEEP_INSIDE = "h1, h2, h3, h4, h5, h6, td, th, caption, figcaption, pre, blockquote";
const INLINE_CONTROLS = new Set(["a", "span", "label"]);

/**
 * Removes standalone controls whose whole visible text is one of
 * CONTROL_LABELS (QA LOW-4: nber.org printed "Copy Citation" and "Download
 * Citation"). Counted as removed widgets. Returns how many were removed.
 */
export function removeControlLabels(root: Element, report: ConvertReport): number {
  let removed = 0;
  for (const el of Array.from(root.querySelectorAll(CONTROL_CANDIDATES))) {
    if (!root.contains(el)) continue; // an ancestor was removed already
    // Hidden parts are already gone here; textContent also reads button labels.
    const shown = normalizeSpace(el.textContent ?? "");
    const text = shown.toLowerCase();
    if (!CONTROL_LABELS.has(text)) continue;
    const keep = el.closest(KEEP_INSIDE);
    if (keep && root.contains(keep)) continue;
    // An inline word inside a sentence ("Click Share to…") is prose: only a
    // link/span that is the whole text of its parent is a standalone control.
    const parent = el.parentElement;
    if (INLINE_CONTROLS.has(tagOf(el)) && parent && parent !== root) {
      if (normalizeSpace(parent.textContent ?? "").toLowerCase() !== text) continue;
    }
    if (el.querySelector(`img, picture, svg, math, table, iframe, video, ${KEEP_INSIDE}`)) continue;
    const words = countWords(text);
    report.widgetsRemoved++;
    report.widgetWords += words;
    report.details.push(`Removed on purpose: a "${shown}" control (${words} words).`);
    el.remove();
    removed++;
  }
  return removed;
}

export function prepareContent(root: Element, report: ConvertReport, widgetSelectors: string[] = []): void {
  // One pass: lazy images recovered from <noscript>, then noscript and invisible parts removed.
  let noscriptWords = 0;
  for (const el of Array.from(root.querySelectorAll(`noscript, ${INVISIBLE_SELECTOR}`))) {
    if (!root.contains(el)) continue;
    if (tagOf(el) === "noscript") {
      // <img data-src stub> followed by <noscript><img src=real></noscript>.
      const prev = el.previousElementSibling;
      const inner = el.textContent ?? "";
      if (prev && tagOf(prev) === "img" && /<img\b/i.test(inner)) {
        const m = inner.match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']{1,2000})["']/i);
        const cur = prev.getAttribute("src") ?? "";
        if (m && (!cur || isPlaceholderDataUrl(cur)) && !prev.getAttribute("data-src") && !prev.getAttribute("srcset")) {
          prev.setAttribute("data-src", m[1]);
        }
      }
      noscriptWords += countWords(inner.replace(/<[^>]{0,2000}>/g, " "));
    }
    el.remove();
  }
  if (noscriptWords > 0) report.details.push(`Skipped ${noscriptWords} words inside <noscript> (shown only without JavaScript).`);

  // Hidden content is not visible on the page: skip it, but say so.
  const hiddenWords = removeHidden(root);
  report.hiddenWords += hiddenWords;
  if (hiddenWords > 0) report.details.push(`Skipped ${hiddenWords} hidden words (hidden parts and closed pop-ups).`);

  // Widgets removed on purpose: counted, never reported as loss.
  const explicit = widgetSelectors.join(", ");
  const all = [...DEFAULT_WIDGETS, ...widgetSelectors].join(", ");
  for (const el of topLevel(root, all)) {
    if (!root.contains(el)) continue;
    const tag = tagOf(el);
    if (tag === "form" && isContentForm(el)) {
      // Keep the content, drop only the controls inside.
      for (const c of Array.from(el.querySelectorAll(all))) {
        if (!root.contains(c) || tagOf(c) === "form") continue;
        const w = countNodeWords(c);
        if (w > 0) {
          report.widgetsRemoved++;
          report.widgetWords += w;
        }
        c.remove();
      }
      continue;
    }
    const words = countNodeWords(el);
    if (words > 0 || tag === "form" || (explicit && el.matches(explicit))) {
      report.widgetsRemoved++;
      report.widgetWords += words;
      if (words > 0) report.details.push(`Removed on purpose: ${describe(el)} (${words} words).`);
    }
    el.remove();
  }

  // Lone page controls ("Copy Citation", "Share" …) outside the text blocks.
  removeControlLabels(root, report);

  // Emoji images print as their text.
  for (const img of Array.from(root.querySelectorAll("img.emoji, img.wp-smiley, img[data-emoji]"))) {
    const alt = img.getAttribute("alt") ?? "";
    img.replaceWith(root.ownerDocument.createTextNode(alt));
  }

  // Counts of what we found (after cleaning), in one pass.
  const hasAncestor = (el: Element, sel: string) => {
    const a = el.parentElement?.closest(sel);
    return !!a && root.contains(a);
  };
  for (const el of Array.from(root.querySelectorAll(`img, table, pre, ${EMBED_SELECTOR}`))) {
    const tag = tagOf(el);
    if (tag === "img") {
      if (insideMedia(el, root)) continue; // fallback content of a video/object: not shown
      // Part of an embed card (e.g. the logo in a Substack "embedded post"): the
      // whole embed prints as one visible placeholder with its link, so this
      // image is not reported again as a missing image.
      if (hasAncestor(el, EMBED_SELECTOR)) continue;
      if (isTrackingPixel(attrsOf(el))) report.imagesSkipped++;
      else report.imagesFound++;
    } else if (tag === "table") {
      if (insideNonLayoutTable(el, root)) continue;
      // Inside a list item or quote the table is printed as part of that HTML, whatever its kind.
      const inBlockHtml = hasAncestor(el, "li, blockquote");
      if (inBlockHtml || (!el.matches(EQUATION_TABLE) && !isLayoutTable(el) && !isEmptyTable(el))) {
        report.tablesFound++;
      }
    } else if (tag === "pre") {
      if (!hasAncestor(el, "pre") && countNodeWords(el) > 0) report.codeFound++;
    } else if (isImageObject(el)) {
      if (!insideMedia(el, root)) report.imagesFound++;
    } else if (!hasAncestor(el, EMBED_SELECTOR)) {
      report.embedsFound++;
    }
  }
  if (report.imagesSkipped > 0) report.details.push(`Skipped ${report.imagesSkipped} tracking pixel image(s).`);
}

/**
 * Convert a content node (mutated in place: pass a node you own) to PrintElements.
 */
export function convertContent(root: Element, opts: ConvertOptions): ConvertResult {
  const walker = new Walker(opts.baseUrl);
  prepareContent(root, walker.report, opts.widgetSelectors ?? []);
  const wordsFound = countNodeWords(root);
  walker.walkChildren(root);
  return { elements: walker.out, report: walker.report, wordsFound };
}
