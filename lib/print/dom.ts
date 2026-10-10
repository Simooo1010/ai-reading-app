// jsdom setup for Print: parse only. No scripts run, no resources load
// (images, CSS, frames), nothing is printed to the console.

import { JSDOM, VirtualConsole } from "jsdom";

export function parseDocument(html: string, url: string): JSDOM {
  // Default jsdom options already mean: runScripts off, resources not loaded.
  // We set them explicitly anyway, and silence the virtual console.
  return new JSDOM(html, {
    url,
    contentType: "text/html",
    virtualConsole: new VirtualConsole(),
    pretendToBeVisual: false,
  });
}

/** The page URL used to resolve relative links: <base href> when it is http(s), else the page URL. */
export function baseUrlOf(doc: Document, pageUrl: string): string {
  const base = doc.querySelector("base[href]")?.getAttribute("href");
  if (base) {
    try {
      const u = new URL(base, pageUrl);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch {
      // ignore a bad <base>
    }
  }
  return pageUrl;
}

export function hasClass(el: Element, ...names: string[]): boolean {
  const cl = el.classList;
  for (const n of names) if (cl.contains(n)) return true;
  return false;
}

/** Element count and maximum nesting depth (iterative, safe on hostile pages). */
export function domShape(root: Element): { elements: number; depth: number } {
  let elements = 0;
  let depth = 0;
  const stack: [Element, number][] = [[root, 1]];
  while (stack.length) {
    const [el, d] = stack.pop()!;
    elements++;
    if (d > depth) depth = d;
    const kids = el.children;
    for (let i = 0; i < kids.length; i++) stack.push([kids[i], d + 1]);
  }
  return { elements, depth };
}

/** Real pages in the list are at most ~30 levels deep and ~4,000 elements. */
export const MAX_DOM_DEPTH = 1000;
export const READABILITY_MAX_DEPTH = 200;
export const READABILITY_MAX_ELEMENTS = 50_000;

const NESTING_TAG = /<(\/?)(?:div|span|section|article|main|blockquote|ul|ol|table|a|em|strong|b|i|font)(?=[\s>/])/gi;

/**
 * Rough nesting depth from the raw HTML, before parsing (linear scan).
 * The HTML parser slows down badly on extreme nesting, so we refuse such
 * pages before parsing. Real pages stay far below the limit even with a
 * few unclosed tags.
 */
export function estimateNesting(html: string): number {
  let depth = 0;
  let max = 0;
  NESTING_TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NESTING_TAG.exec(html)) !== null) {
    if (m[1]) depth = Math.max(0, depth - 1);
    else if (++depth > max) max = depth;
  }
  return max;
}

export const MAX_ESTIMATED_NESTING = 3000;

const STREAM_PAIR = /\$R[A-Z]?\("([BPS]:[0-9a-zA-Z]{1,12})","([BPS]:[0-9a-zA-Z]{1,12})"/g;

/**
 * React streaming SSR (Next.js App Router, LessWrong...) sends the real
 * content in <div hidden id="S:n"> and a script moves it into
 * <template id="B:n"> / <template id="P:n"> at runtime. We do not run
 * scripts, so we make the same moves here. Returns how many segments moved.
 */
export function resolveStreamedContent(doc: Document): number {
  const pairs: [string, string][] = []; // [template id, segment id]
  for (const sc of Array.from(doc.querySelectorAll("script:not([src])"))) {
    const t = sc.textContent ?? "";
    if (!t.includes("$R")) continue;
    STREAM_PAIR.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = STREAM_PAIR.exec(t)) !== null) {
      const [a, b] = [m[1], m[2]];
      if (b.startsWith("S:") && !a.startsWith("S:")) pairs.push([a, b]);
      else if (a.startsWith("S:") && !b.startsWith("S:")) pairs.push([b, a]);
    }
  }
  if (pairs.length === 0) {
    // No scripts found: pair by number (React usually numbers them alike).
    for (const seg of Array.from(doc.querySelectorAll('div[hidden][id^="S:"]'))) {
      const n = seg.id.slice(2);
      if (doc.getElementById(`B:${n}`)) pairs.push([`B:${n}`, seg.id]);
      else if (doc.getElementById(`P:${n}`)) pairs.push([`P:${n}`, seg.id]);
    }
  }
  let moved = 0;
  for (const [tplId, segId] of pairs.slice(0, 5000)) {
    const tpl = doc.getElementById(tplId);
    const seg = doc.getElementById(segId);
    if (!tpl || !seg || tpl.localName !== "template" || !seg.hasAttribute("hidden")) continue;
    const parent = tpl.parentNode;
    if (!parent) continue;
    if (tplId.startsWith("B:")) {
      // Drop the loading fallback: siblings up to the matching <!--/$--> comment.
      let n = tpl.nextSibling;
      let depth = 0;
      while (n) {
        const next = n.nextSibling;
        if (n.nodeType === 8) {
          const d = (n as Comment).data;
          if (d === "/$") {
            if (depth === 0) break;
            depth--;
          } else if (d === "$" || d === "$?" || d === "$!") depth++;
        }
        parent.removeChild(n);
        n = next;
      }
    }
    while (seg.firstChild) parent.insertBefore(seg.firstChild, tpl);
    tpl.remove();
    seg.remove();
    moved++;
  }
  return moved;
}
