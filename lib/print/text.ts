// Visible text and word counting (SPEC.md §7.4 "Fidelity rules").
// Client-safe: no jsdom, no sanitize-html, no Node modules. The server
// (lib/print/fidelity.ts re-exports these) and the print page use the SAME
// code, so "printed" and "on the pages" are counted the same way.

/**
 * Tags whose CONTENT is dropped together with the tag (not visible text, or
 * unsafe). The same list is used by the sanitizer (lib/print/sanitize.ts) and
 * the word counter, so "found" and "printed" are measured the same way.
 */
export const NON_TEXT_TAGS = [
  "script",
  "style",
  "noscript",
  "template",
  "textarea",
  "option",
  "select",
  "button",
  "svg",
  "iframe",
  "frame",
  "frameset",
  "video",
  "audio",
  "object",
  "canvas",
  "head",
  "title",
  "xmp",
  "plaintext",
  "noembed",
  "noframes",
  "annotation",
  "annotation-xml",
] as const;

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
 * `skip` (optional) leaves out whole element subtrees (the print page uses it
 * for its header, footer and placeholder notes).
 */
export function visibleText(root: Node, boundary: " " | "\n" = " ", skip?: (el: Element) => boolean): string {
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
      if (skip && skip(n as Element)) continue;
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
