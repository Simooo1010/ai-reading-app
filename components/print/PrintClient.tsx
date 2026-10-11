"use client";

// The print screen (SPEC.md §7.4). Client component rendered by the server
// page app/print/[id]/page.tsx with the item and its PrintResult.
// Read-only: it never writes to Notion. Its fonts and CSS load only here.
//
// Imports from lib/print are client-safe only: types, format, options,
// pages, settings, text (no jsdom, no sanitize-html, no Node modules).

import "@/design-system/print.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent } from "react";
import { useStandalone } from "@/components/useStandalone";
import { safeHttpUrl } from "@/lib/links";
import { noticeWarnings, pageCheck, pdfTitle } from "@/lib/print/format";
import { applyOptions, countImagesNotLoaded } from "@/lib/print/options";
import { elementTraits } from "@/lib/print/pages";
import type { PrintSettings } from "@/lib/print/settings";
import type { PrintResult } from "@/lib/print/types";
import { printFontVariables } from "./fonts";
import type { BlockSpec, ImageActions } from "./PrintBlocks";
import { PrintControls } from "./PrintControls";
import { type PagesReport, PrintPages } from "./PrintPages";
import { usePrintSettings } from "./usePrintSettings";

export type PrintItemInfo = { id: string; title: string; author: string; link: string; readingTimeMin: number | null };

/** Restore the tab title even if the browser never sends "afterprint". */
const TITLE_RESTORE_MS = 60_000;

const SOURCE_LABEL: Record<PrintResult["source"], string> = {
  substack: "Substack post",
  web: "Web page",
  "arxiv-html": "arXiv paper",
};

function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M11 7H3.5M7 3.2L3.2 7 7 10.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M4 10L10 4M5 4h5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OpenSource({ link, primary }: { link: string; primary: boolean }) {
  const href = safeHttpUrl(link); // http(s) only, never another scheme
  if (!href) return null;
  return (
    <a className={`rr-btn ${primary ? "rr-btn--primary" : "rr-btn--secondary"}`} href={href} target="_blank" rel="noopener noreferrer">
      Open source
      <ArrowUpRightIcon />
      <span className="rr-sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export default function PrintClient({
  item,
  result,
  backHref,
}: {
  item: PrintItemInfo;
  result: PrintResult;
  backHref: string;
}): JSX.Element {
  const { settings, update, reset } = usePrintSettings();
  // The pages are built again REPACK_DEBOUNCE_MS after the last change (inside PrintPages).
  const applied: PrintSettings = settings;
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [report, setReport] = useState<PagesReport | null>(null);
  const [printFailed, setPrintFailed] = useState(false);
  const standalone = useStandalone();

  const doc = result.document;
  const printable =
    !!doc &&
    doc.elements.length > 0 &&
    (result.status === "ok" || result.status === "warning" || result.status === "paywalled" || result.status === "too-short");
  const partial = result.status === "paywalled" || result.status === "too-short";

  const options = useMemo(
    () => applyOptions(doc, { excludeEmbeds: applied.excludeEmbeds, removedImages: removed }),
    [doc, applied.excludeEmbeds, removed],
  );

  const blocks = useMemo<BlockSpec[]>(() => {
    if (!doc || !printable) return [];
    const out: BlockSpec[] = [];
    const kept = new Set(options.sourceIndex);
    out.push({
      id: "head",
      kind: "head",
      doc,
      fallbackTitle: item.title,
      fallbackAuthor: item.author,
      partialNote: partial ? result.message : undefined,
      traits: { keepWithNext: true, breakable: false, atomic: true },
    });
    const els = doc.elements;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (kept.has(i)) {
        // The next element that will really be printed decides keep-with-next.
        let next = undefined;
        for (let j = i + 1; j < els.length; j++) {
          if (kept.has(j)) {
            next = els[j];
            break;
          }
        }
        const traits = elementTraits(el, next);
        if (el.type === "list" && el.items.length > 1) {
          // Item by item: a long list (footnotes, references) packs like paragraphs.
          el.items.forEach((_, k) =>
            out.push({
              id: `e${i}.${k}`,
              kind: "li",
              list: el,
              item: k,
              traits: k === el.items.length - 1 ? traits : { keepWithNext: false, breakable: true, atomic: false },
            }),
          );
        } else {
          out.push({ id: `e${i}`, kind: "el", el, traits });
        }
      } else if (el.type === "image") {
        out.push({
          id: `r${i}`,
          kind: "removed",
          src: el.src,
          label: el.alt,
          traits: { keepWithNext: true, breakable: false, atomic: true },
        });
      }
    }
    out.push({
      id: "foot",
      kind: "foot",
      doc,
      fallbackTitle: item.title,
      fallbackAuthor: item.author,
      fallbackUrl: item.link,
      partialNote: partial ? result.message : undefined,
      traits: { keepWithNext: false, breakable: false, atomic: true },
    });
    return out;
  }, [doc, printable, options, item.title, item.author, item.link, partial, result.message]);

  const blocksKey = useMemo(() => blocks.map((b) => b.id).join(","), [blocks]);

  const onRemove = useCallback((src: string) => setRemoved((s) => new Set(s).add(src)), []);
  const onRestore = useCallback(
    (src: string) =>
      setRemoved((s) => {
        const n = new Set(s);
        n.delete(src);
        return n;
      }),
    [],
  );
  const onError = useCallback(
    (src: string) => setFailed((s) => (s.has(src) ? s : new Set(s).add(src))),
    [],
  );
  const actions = useMemo<ImageActions>(
    () => ({ interactive: true, failed, onRemove, onRestore, onError }),
    [failed, onRemove, onRestore, onError],
  );

  const check = pageCheck({
    check: result.check,
    excludedEmbeds: options.excludedEmbeds,
    removedImages: options.removedImagesCount,
    excludedWords: options.excludedWords,
    // A report for other blocks (an image was just removed) is not used.
    wordsOnPages: report && report.blocksKey === blocksKey ? report.wordsOnPages : null,
    // Images that print as "Image could not be loaded": never a clean "Check passed".
    imagesNotLoaded: countImagesNotLoaded(options.elements, failed),
  });

  // ── Print: a good PDF file name, then restore the tab title ──
  const restoreRef = useRef<(() => void) | null>(null);
  useEffect(() => () => restoreRef.current?.(), []);
  const onPrint = useCallback(() => {
    restoreRef.current?.();
    const original = document.title;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
      if (timer) clearTimeout(timer);
      restoreRef.current = null;
    };
    restoreRef.current = restore;
    document.title = pdfTitle(item.title, doc);
    window.addEventListener("afterprint", restore);
    timer = setTimeout(restore, TITLE_RESTORE_MS);
    try {
      window.print();
      setPrintFailed(false);
    } catch {
      // Some web views (e.g. a home screen app) may not allow print().
      restore();
      setPrintFailed(true);
    }
  }, [item.title, doc]);

  // Links inside the preview come from the source page. Open web links in a
  // new tab, so in the home screen app they never replace this page.
  const onPreviewClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const target = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!(target instanceof HTMLAnchorElement)) return;
    const href = safeHttpUrl(target.href);
    if (!href) return;
    e.preventDefault();
    window.open(href, "_blank", "noopener,noreferrer");
  }, []);

  const ready = report !== null && report.blocksKey === blocksKey;
  const hasEmbeds = !!doc && doc.elements.some((e) => e.type === "embed");
  // Not the warnings the headline message already says (no reason twice).
  const warnings = noticeWarnings(result.status, result.warnings);
  const title = item.title || doc?.title || "Untitled";

  return (
    <div className={`rr-print ${printFontVariables}`}>
      {/* Sticky: there is no browser Back button in the home screen app. */}
      <nav className="rr-print__nav" aria-label="Back">
        <div className="rr-print__nav-inner">
          <Link className="rr-btn rr-btn--link rr-print__back" href={backHref} prefetch={false}>
            <ArrowLeftIcon />
            Back
          </Link>
        </div>
      </nav>
      <div className="rr-print__chrome">
        <header className="rr-header">
          <span className="rr-label">Print</span>
          <span className="rr-header__context">{SOURCE_LABEL[result.source] ?? "Web page"}</span>
        </header>
        <div className="rr-print__intro">
          <h1 className="rr-print__title">{title}</h1>
          {item.author ? <p className="rr-author">by {item.author}</p> : null}
        </div>

        {!printable ? (
          <section className="rr-section rr-print-notice" aria-labelledby="rr-print-notice-h">
            <h2 className="rr-label rr-label--ink" id="rr-print-notice-h">
              Cannot print this page
            </h2>
            <p className="rr-body">{result.message}</p>
            {warnings.length > 0 && result.status !== "blocked" && result.status !== "failed" ? (
              <ul className="rr-print-notice__list">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            <div className="rr-actions rr-print-notice__actions">
              <OpenSource link={item.link} primary />
              <Link className="rr-btn rr-btn--link" href={backHref} prefetch={false}>
                Back
              </Link>
            </div>
          </section>
        ) : (
          <>
            {result.status === "ok" ? (
              <p className="rr-body-italic rr-print__ready">
                {check.imagesNotLoaded > 0 ? "You can print, but some images could not be loaded." : result.message}
              </p>
            ) : (
              <section className="rr-section rr-print-notice" aria-labelledby="rr-print-notice-h">
                <h2 className="rr-label rr-label--ink" id="rr-print-notice-h">
                  {partial ? "Only part of the text" : "Please check"}
                </h2>
                {partial ? <p className="rr-body">{result.message}</p> : null}
                {warnings.length > 0 ? (
                  <ul className="rr-print-notice__list">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : !partial ? (
                  <p className="rr-body">{result.message}</p>
                ) : null}
                {partial ? (
                  <p className="rr-body-italic">The preview below shows what we found. You can print it, or open the source.</p>
                ) : null}
                {partial ? (
                  <div className="rr-print-notice__actions">
                    <OpenSource link={item.link} primary={false} />
                  </div>
                ) : null}
              </section>
            )}

            <section className="rr-section rr-section--hair rr-print-check" aria-labelledby="rr-print-check-h">
              <h2 className="rr-label" id="rr-print-check-h">
                Check
              </h2>
              <p className="rr-print-check__line">{check.checkLine}</p>
              {check.leftOut ? <p className="rr-print-check__line">{check.leftOut}</p> : null}
              <p className="rr-print-check__line" aria-live="polite">
                {check.onPages ?? "Counting the words on the pages…"}
              </p>
              {check.imagesNotLoaded > 0 ? (
                <p className="rr-print-check__fail" role="status">
                  {check.imagesNotLoaded === 1 ? "1 image" : `${check.imagesNotLoaded} images`} could not be loaded. Look at the preview before you print.
                </p>
              ) : null}
              {check.mismatch ? (
                <p className="rr-print-check__fail" role="alert">
                  Check failed: the pages do not match the text. Do not rely on this printout.
                </p>
              ) : null}
              {removed.size > 0 ? (
                <button type="button" className="rr-btn rr-btn--link" onClick={() => setRemoved(new Set())}>
                  Restore all images
                </button>
              ) : null}
            </section>

            <PrintControls settings={settings} onChange={update} onReset={reset} hasEmbeds={hasEmbeds} />

            <section className="rr-section rr-print-go" aria-label="Print">
              <button type="button" className="rr-btn rr-btn--primary" onClick={onPrint} disabled={!ready}>
                {partial ? "Print what we found" : "Print / Save as PDF"}
              </button>
              {printFailed ? (
                <p className="rr-meta-italic" role="alert">
                  The print screen did not open. Tap Share, then Print, to save it as a PDF.
                </p>
              ) : standalone ? (
                <p className="rr-meta-italic">If the print screen does not open, tap Share, then Print, to save it as a PDF.</p>
              ) : (
                <p className="rr-meta-italic">Set margins to &quot;None&quot; in the print dialog for best results.</p>
              )}
              {report && report.sheets !== report.pages ? (
                <p className="rr-meta-italic">
                  {report.pages} pages in the preview; some are longer than one page, so the printout has about {report.sheets} sheets.
                </p>
              ) : null}
            </section>
          </>
        )}
      </div>

      {printable ? (
        <div className="rr-print__preview" aria-label="Preview of the printed pages" onClick={onPreviewClick}>
          <PrintPages blocks={blocks} settings={applied} actions={actions} onReport={setReport} />
        </div>
      ) : null}
    </div>
  );
}
