// Page packing for the print page (SPEC.md §7.4, Pressroom's mechanism step 3).
// Client-safe pure code: it gets measured block heights and returns which
// blocks go on which A4 page. The browser measures; this decides.
//
// Rules:
// - Blocks are packed in order; a block is never split by us.
// - keepWithNext (headings, lead-in lines ending with ":", the thing before a
//   caption, the document header) stays on the same page as the next block.
//   Chains work: heading + subheading + paragraph move together.
// - A block that fits on a page never splits across pages (figures, tables,
//   code, paragraphs): if it does not fit, it starts the next page.
// - A block TALLER than a page is never clipped: it gets a "flow" page with no
//   fixed height, and the browser breaks it across sheets when printing.
// - No page is empty and there is no trailing blank page.

import { inlineHtmlText } from "./options";
import type { PrintElement } from "./types";

export interface PackBlock {
  id: string;
  /** Measured height in px, margins included. */
  height: number;
  /** Must be on the same page as the block after it. */
  keepWithNext: boolean;
  /** May be broken across sheets by the browser (text) when it is on a flow page. */
  breakable: boolean;
  /** Must never be split (image, table, code smaller than a page). */
  atomic: boolean;
}

export interface PackedPage {
  ids: string[];
  /** True when the page holds a block taller than one page: no fixed height, the browser paginates it. */
  flow: boolean;
  /** Sum of the block heights in px. */
  height: number;
}

const EPS = 1e-6;

function safeHeight(h: number): number {
  return Number.isFinite(h) && h > 0 ? h : 0;
}

/** Number of trailing blocks of `page` that must stay with what follows. */
function trailingChain(page: PackBlock[]): number {
  let n = 0;
  for (let i = page.length - 1; i >= 0 && page[i].keepWithNext; i--) n++;
  return n;
}

function sum(blocks: PackBlock[]): number {
  let s = 0;
  for (const b of blocks) s += safeHeight(b.height);
  return s;
}

export function packPages(blocks: PackBlock[], contentHeightPx: number): PackedPage[] {
  const H = Number.isFinite(contentHeightPx) && contentHeightPx > 0 ? contentHeightPx : 1;
  const pages: { blocks: PackBlock[]; flow: boolean }[] = [];
  let cur: PackBlock[] = [];
  let used = 0;

  const close = (flow = false) => {
    if (cur.length) pages.push({ blocks: cur, flow });
    cur = [];
    used = 0;
  };

  for (const b of blocks) {
    const h = safeHeight(b.height);
    if (h > H + EPS) {
      // Taller than a page. Right after another flow page (nothing, or only a
      // keep-with-next chain, in between) it joins that flow page: the browser
      // paginates the run as one, so short tails do not each waste a sheet.
      const last = pages[pages.length - 1];
      if (last?.flow && cur.length === trailingChain(cur)) {
        last.blocks.push(...cur, b);
        cur = [];
        used = 0;
        continue;
      }
      // Otherwise its own flow page, with the chain that must stay with it.
      const n = trailingChain(cur);
      const chain = n > 0 ? cur.slice(cur.length - n) : [];
      if (n > 0) cur = cur.slice(0, cur.length - n);
      close();
      cur = [...chain, b];
      close(true);
      continue;
    }
    if (used + h <= H + EPS) {
      cur.push(b);
      used += h;
      continue;
    }
    // Does not fit: move the trailing keep-with-next chain to the new page,
    // when the chain and this block fit together on an empty page and the
    // old page keeps at least one block.
    const n = trailingChain(cur);
    if (n > 0 && n < cur.length) {
      const chain = cur.slice(cur.length - n);
      const chainH = sum(chain);
      if (chainH + h <= H + EPS) {
        cur = cur.slice(0, cur.length - n);
        close();
        cur = [...chain, b];
        used = chainH + h;
        continue;
      }
    }
    close();
    cur = [b];
    used = h;
  }
  close();

  // A page that holds only zero-height blocks (markers) is not a real page:
  // join it to the next page, or to the previous one at the end.
  for (let i = 0; i < pages.length; i++) {
    if (pages.length > 1 && sum(pages[i].blocks) === 0) {
      if (i + 1 < pages.length) pages[i + 1].blocks = [...pages[i].blocks, ...pages[i + 1].blocks];
      else pages[i - 1].blocks = [...pages[i - 1].blocks, ...pages[i].blocks];
      pages.splice(i, 1);
      i--;
    }
  }

  return pages.map((p) => ({ ids: p.blocks.map((b) => b.id), flow: p.flow, height: sum(p.blocks) }));
}

/** Sheets of paper a packed page needs: 1, or more for a flow page. */
export function sheetsFor(page: PackedPage, contentHeightPx: number): number {
  if (!page.flow) return 1;
  const H = Number.isFinite(contentHeightPx) && contentHeightPx > 0 ? contentHeightPx : 1;
  return Math.max(1, Math.ceil(page.height / H - EPS));
}

/** A4 in CSS px (96 per inch): 210 x 297 mm. */
export const MM_PX = 96 / 25.4;
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/** Height in px of the text area of an A4 page with this margin (mm) on every side. */
export function contentHeightPx(marginMm: number): number {
  return (A4_HEIGHT_MM - 2 * marginMm) * MM_PX;
}

export interface BlockTraits {
  keepWithNext: boolean;
  breakable: boolean;
  atomic: boolean;
}

/** True for a lead-in line: a paragraph whose text ends with ":". */
export function isLeadIn(el: PrintElement): boolean {
  return el.type === "paragraph" && /[:：]\s*$/.test(inlineHtmlText(el.html));
}

/**
 * How an element behaves on a page: headings and lead-in lines stay with the
 * next block; the block before a caption paragraph stays with its caption;
 * images, tables, code, embeds and placeholders never split.
 */
export function elementTraits(el: PrintElement, next?: PrintElement): BlockTraits {
  const beforeCaption = next?.type === "paragraph" && next.from === "figcaption";
  switch (el.type) {
    case "heading":
      return { keepWithNext: true, breakable: false, atomic: false };
    case "paragraph":
      return { keepWithNext: isLeadIn(el) || beforeCaption, breakable: true, atomic: false };
    case "image":
    case "table":
    case "code":
    case "embed":
    case "placeholder":
      return { keepWithNext: beforeCaption, breakable: false, atomic: true };
    case "separator":
      return { keepWithNext: false, breakable: false, atomic: true };
    default:
      return { keepWithNext: beforeCaption, breakable: true, atomic: false };
  }
}
