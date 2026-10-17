"use client";

// Builds real A4 pages in the browser (SPEC.md §7.4, Pressroom's mechanism):
// 1. render every block once in a hidden measurer at the real page width,
// 2. wait for fonts and images (their heights change the layout),
// 3. read all block heights in one pass (no layout thrash),
// 4. pack them into pages (lib/print/pages.ts),
// 5. render the pages, check that no fixed page overflows (re-pack with a
//    reserve, or let that page flow, so nothing is ever clipped), and count
//    the words that are really on the pages.
// Re-runs when the settings, the blocks, a failed image or a late font change.

import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { contentHeightPx, MM_PX, A4_WIDTH_MM, packPages, type PackedPage, sheetsFor } from "@/lib/print/pages";
import type { PrintSettings } from "@/lib/print/settings";
import { countWords, visibleText } from "@/lib/print/text";
import { type BlockSpec, type ImageActions, PrintBlock } from "./PrintBlocks";

export interface PagesReport {
  /** Packed pages (preview sheets). */
  pages: number;
  /** Sheets of paper when printed (flow pages can need more than one). */
  sheets: number;
  flowPages: number;
  /** Words of source text found in the page DOM (header, footer and notes not counted). */
  wordsOnPages: number;
  /** Time to read the block heights and pack them, in ms (waiting for fonts and images not included). */
  packMs: number;
  /** The block ids these pages were built from. */
  blocksKey: string;
}

interface Layout {
  key: string;
  pages: PackedPage[];
  contentH: number;
}

/** px kept free at the bottom of every page for rounding. */
const SAFETY_PX = 2;
/** Longest wait for images before measuring anyway (late images trigger a new pack). */
const IMAGE_WAIT_MS = 10_000;
const FONT_WAIT_MS = 5_000;
const MAX_RESERVE_RETRIES = 2;
/** Wait after the last change (slider, typing) before building the pages again. */
export const REPACK_DEBOUNCE_MS = 200;

const A4_WIDTH_PX = A4_WIDTH_MM * MM_PX;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fontsSettled(): Promise<void> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts) return;
  try {
    await Promise.race([fonts.ready, wait(FONT_WAIT_MS)]);
  } catch {
    // ignore: measure with what we have
  }
}

/** Resolves when every <img> under `root` has loaded or failed (or after the timeout). */
function imagesSettled(root: HTMLElement, pending: Set<string>): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  const waits = imgs
    .filter((img) => !img.complete)
    .map(
      (img) =>
        new Promise<void>((resolve) => {
          const done = () => {
            img.removeEventListener("load", done);
            img.removeEventListener("error", done);
            resolve();
          };
          img.addEventListener("load", done);
          img.addEventListener("error", done);
        }),
    );
  if (waits.length === 0) return Promise.resolve();
  return Promise.race([Promise.all(waits).then(() => undefined), wait(IMAGE_WAIT_MS)]).then(() => {
    for (const img of imgs) if (!img.complete) pending.add(img.currentSrc || img.src);
  });
}

function skipNoCount(el: Element): boolean {
  return el.hasAttribute("data-nocount");
}

export function PrintPages({
  blocks,
  settings,
  actions,
  onReport,
  lang,
}: {
  blocks: BlockSpec[];
  settings: PrintSettings;
  actions: ImageActions;
  onReport: (report: PagesReport | null) => void;
  /** Language of the printed text ("it" for an Italian printout): set on the sheets, not on the screen text around them. */
  lang?: string;
}) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [nonce, setNonce] = useState(0);
  const measurerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const reserveRef = useRef({ key: "", px: 0, retries: 0 });
  const pendingImages = useRef(new Set<string>());
  const measuringRef = useRef(false);
  const packMsRef = useRef(0);
  const packCountRef = useRef(0);

  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const settingsKey = `${settings.format}|${settings.font}|${settings.size}|${settings.lineSpacing}|${settings.margin}`;
  const idsKey = useMemo(() => blocks.map((b) => b.id).join(","), [blocks]);
  const failedKey = useMemo(() => Array.from(actions.failed).sort().join(" "), [actions.failed]);
  const measureKey = `${settingsKey}#${idsKey}#${failedKey}#${nonce}`;
  const measuring = layout?.key !== measureKey;

  const bump = useCallback(() => setNonce((n) => n + 1), []);

  // A late image (it timed out while measuring) or a late font: pack again.
  const bumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpSoon = useCallback(() => {
    if (bumpTimer.current) clearTimeout(bumpTimer.current);
    bumpTimer.current = setTimeout(bump, 200);
  }, [bump]);
  useEffect(() => () => {
    if (bumpTimer.current) clearTimeout(bumpTimer.current);
  }, []);

  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts || typeof fonts.addEventListener !== "function") return;
    const onDone = () => {
      if (!measuringRef.current) bumpSoon();
    };
    fonts.addEventListener("loadingdone", onDone);
    return () => fonts.removeEventListener("loadingdone", onDone);
  }, [bumpSoon]);

  const pageActions = useMemo<ImageActions>(
    () => ({
      ...actions,
      onLoad: (src: string) => {
        if (pendingImages.current.delete(src)) bumpSoon();
      },
    }),
    [actions, bumpSoon],
  );
  const measureActions = useMemo<ImageActions>(
    () => ({ interactive: false, failed: actions.failed, onError: actions.onError }),
    [actions.failed, actions.onError],
  );

  // Steps 1-4: measure in the hidden measurer, then pack.
  useEffect(() => {
    if (!measuring) return;
    let cancelled = false;
    measuringRef.current = true;
    onReport(null);
    const run = async () => {
      await wait(REPACK_DEBOUNCE_MS);
      if (cancelled) return;
      const root = measurerRef.current;
      if (!root) return;
      void root.offsetHeight; // style + layout now, so the needed fonts start loading
      await fontsSettled();
      if (cancelled) return;
      pendingImages.current = new Set();
      await imagesSettled(root, pendingImages.current);
      if (cancelled) return;
      await fontsSettled(); // images can move text onto glyphs that were not needed before
      if (cancelled || !measurerRef.current) return;
      const t1 = performance.now();
      // One read pass: no writes in between, so the browser lays out once.
      const heights = new Map<string, number>();
      for (const el of Array.from(measurerRef.current.querySelectorAll<HTMLElement>("[data-block]"))) {
        heights.set(el.dataset.block ?? "", el.getBoundingClientRect().height);
      }
      const r = reserveRef.current;
      if (r.key !== settingsKey + "#" + idsKey) reserveRef.current = { key: settingsKey + "#" + idsKey, px: 0, retries: 0 };
      const fullH = contentHeightPx(settings.margin);
      const packH = fullH - SAFETY_PX - reserveRef.current.px;
      const pages = packPages(
        blocks.map((b) => ({ id: b.id, height: heights.get(b.id) ?? 0, ...b.traits })),
        packH,
      );
      packMsRef.current = Math.round(performance.now() - t1);
      packCountRef.current++;
      measuringRef.current = false;
      setLayout({ key: measureKey, pages, contentH: packH });
    };
    void run();
    return () => {
      cancelled = true;
    };
    // measureKey covers blocks, settings, failed images and the nonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureKey, measuring]);

  // Step 5: after the pages render, check overflow, size flow frames, count words.
  useLayoutEffect(() => {
    if (!layout || measuring) return;
    const host = pagesRef.current;
    if (!host) return;
    const pageEls = Array.from(host.querySelectorAll<HTMLElement>("[data-page]"));
    let overflow = 0;
    const overflowed: number[] = [];
    let words = 0;
    pageEls.forEach((pageEl, i) => {
      const sheet = pageEl.querySelector<HTMLElement>(".rr-print-sheet");
      const body = pageEl.querySelector<HTMLElement>(".rr-print-sheet__body");
      if (!sheet || !body) return;
      if (layout.pages[i]?.flow) {
        pageEl.style.setProperty("--rr-print-h", `${sheet.offsetHeight}px`);
      } else {
        pageEl.style.removeProperty("--rr-print-h");
        const over = body.scrollHeight - body.clientHeight;
        if (over > 1) {
          overflow = Math.max(overflow, over);
          overflowed.push(i);
        }
      }
      words += countWords(visibleText(body, " ", skipNoCount));
    });
    if (overflowed.length > 0) {
      const r = reserveRef.current;
      if (r.retries < MAX_RESERVE_RETRIES) {
        r.retries++;
        r.px += Math.ceil(overflow) + SAFETY_PX;
        bump();
        return;
      }
      // Still too tall after re-packing: let those pages flow (never clip).
      setLayout({ ...layout, pages: layout.pages.map((p, i) => (overflowed.includes(i) ? { ...p, flow: true } : p)) });
      return;
    }
    const contentFull = contentHeightPx(settings.margin);
    let sheets = 0;
    layout.pages.forEach((p, i) => {
      const body = pageEls[i]?.querySelector<HTMLElement>(".rr-print-sheet__body");
      sheets += sheetsFor({ ...p, height: p.flow && body ? body.scrollHeight : p.height }, contentFull);
    });
    // For tests and debugging: how long the last pack took, how many packs ran.
    host.dataset.packMs = String(packMsRef.current);
    host.dataset.packCount = String(packCountRef.current);
    onReport({
      pages: layout.pages.length,
      sheets,
      flowPages: layout.pages.filter((p) => p.flow).length,
      wordsOnPages: words,
      packMs: packMsRef.current,
      blocksKey: idsKey,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, measuring]);

  // Fit the A4 sheets to the screen width (never a horizontal page scroll).
  useLayoutEffect(() => {
    const host = pagesRef.current;
    if (!host) return;
    const apply = () => {
      const w = host.clientWidth;
      const s = w > 0 ? Math.min(1, w / A4_WIDTH_PX) : 1;
      host.style.setProperty("--rr-print-scale", s.toFixed(4));
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const sheetStyle = {
    "--rr-print-size": `${settings.size}pt`,
    "--rr-print-leading": String(settings.lineSpacing),
    "--rr-print-margin": `${settings.margin}mm`,
  } as CSSProperties;

  const pages = layout?.pages ?? [];
  const total = pages.length;
  const contentFull = contentHeightPx(settings.margin);

  return (
    <div className="rr-print-doc" style={sheetStyle} data-format={settings.format} data-font={settings.font}>
      <p className="rr-print-preview__status" role="status" aria-live="polite">
        {measuring ? (layout ? "Updating the pages…" : "Preparing the pages…") : `${total} ${total === 1 ? "page" : "pages"} ready.`}
      </p>
      <div className="rr-print-pages" ref={pagesRef} data-busy={measuring ? "" : undefined}>
        {pages.map((p, i) => (
          <section
            key={i}
            className={`rr-print-page${p.flow ? " rr-print-page--flow" : ""}`}
            data-page={i}
            aria-label={`Page ${i + 1} of ${total}`}
          >
            <div className="rr-print-page__frame">
              <div className={`rr-print-sheet${p.flow ? " rr-print-sheet--flow" : ""}`} lang={lang}>
                <div className="rr-print-sheet__body">
                  {p.ids.map((id) => {
                    const b = byId.get(id);
                    return b ? <PrintBlock key={id} block={b} actions={pageActions} /> : null;
                  })}
                </div>
              </div>
            </div>
            <p className="rr-print-page__caption" aria-hidden="true">
              Page {i + 1} of {total}
              {p.flow ? ` · longer than one page, prints on about ${sheetsFor(p, contentFull)} sheets` : ""}
            </p>
          </section>
        ))}
      </div>
      {measuring ? (
        <div className="rr-print-measure-box" aria-hidden="true">
          <div className="rr-print-sheet rr-print-sheet--measure" ref={measurerRef} lang={lang}>
            <div className="rr-print-sheet__body">
              {blocks.map((b) => (
                <PrintBlock key={b.id} block={b} actions={measureActions} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
