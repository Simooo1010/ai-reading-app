"use client";

// Renders the printed document, one block at a time (SPEC.md §7.4).
// Safety: the ONLY HTML set with dangerouslySetInnerHTML is the `html`,
// `items` and `caption` fields of PrintElement, which are always the output of
// lib/print/sanitize.ts (strict allowlist: no scripts, no event handlers, no
// style, http(s)/mailto links only). Everything else (titles, authors, alt
// text, URLs, labels, code) is React text, so it is escaped.
// Elements marked data-nocount are not part of the source text (header,
// footer, placeholder labels): the page check skips them.

import { memo, type ReactNode } from "react";
import { formatPrintDate } from "@/lib/print/format";
import { isPrintableImageSrc } from "@/lib/print/options";
import type { BlockTraits } from "@/lib/print/pages";
import { placeholderText, type PrintDocument, type PrintElement } from "@/lib/print/types";

export type BlockSpec =
  | { id: string; kind: "head"; doc: PrintDocument; fallbackTitle: string; fallbackAuthor: string; partialNote?: string; traits: BlockTraits }
  | { id: string; kind: "foot"; doc: PrintDocument; fallbackTitle: string; fallbackAuthor: string; fallbackUrl: string; partialNote?: string; traits: BlockTraits }
  | { id: string; kind: "el"; el: PrintElement; traits: BlockTraits }
  /** One item of a list: lists are packed item by item, so a long list never needs a page of its own. */
  | { id: string; kind: "li"; list: Extract<PrintElement, { type: "list" }>; item: number; traits: BlockTraits }
  /** An image the user removed: zero height, holds the "Restore image" button (screen only). */
  | { id: string; kind: "removed"; src: string; label: string; traits: BlockTraits };

export interface ImageActions {
  /** Interactive preview: show the Remove / Restore buttons. */
  interactive: boolean;
  failed: ReadonlySet<string>;
  onRemove?: (src: string) => void;
  onRestore?: (src: string) => void;
  onError?: (src: string) => void;
  onLoad?: (src: string) => void;
}

function Html({ as: Tag, html, className }: { as: "p" | "blockquote" | "aside" | "div" | "li" | "figcaption" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"; html: string; className?: string }) {
  // `html` is sanitized lib/print output (see the note at the top of this file).
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Note({ label, children, kind }: { label: string; children?: ReactNode; kind: string }) {
  return (
    <div className="rr-print-note" data-kind={kind}>
      <p className="rr-print-note__label" data-nocount="">
        [{label}]
      </p>
      {children}
    </div>
  );
}

function imageLabel(el: { alt: string; caption: string }): string {
  return el.alt.trim();
}

function ImageBlock({ el, actions }: { el: Extract<PrintElement, { type: "image" }>; actions: ImageActions }) {
  const usable = isPrintableImageSrc(el.src) && !actions.failed.has(el.src);
  if (!usable) {
    const shown = el.src.startsWith("data:") ? "embedded image" : el.src;
    return (
      <figure className="rr-print-figure">
        <Note kind="image" label={`Image could not be loaded: ${shown}`} />
        {el.caption ? <Html as="figcaption" html={el.caption} /> : null}
      </figure>
    );
  }
  const alt = imageLabel(el);
  return (
    <figure className="rr-print-figure">
      {/* eslint-disable-next-line @next/next/no-img-element -- printed paper: the original image, no optimizer */}
      <img
        src={el.src}
        alt={alt}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => actions.onError?.(el.src)}
        onLoad={() => actions.onLoad?.(el.src)}
      />
      {el.caption ? <Html as="figcaption" html={el.caption} /> : null}
      {actions.interactive && actions.onRemove ? (
        <button
          type="button"
          className="rr-print-imgtoggle"
          onClick={() => actions.onRemove?.(el.src)}
          aria-label={alt ? `Remove image: ${alt}` : "Remove image"}
        >
          Remove image
        </button>
      ) : null}
    </figure>
  );
}

function Element({ el, actions }: { el: PrintElement; actions: ImageActions }) {
  switch (el.type) {
    case "paragraph":
      return <Html as="p" html={el.html} className={el.from === "figcaption" ? "rr-print-caption" : undefined} />;
    case "heading": {
      const tag = `h${Math.min(6, Math.max(1, el.level))}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Html as={tag} html={el.html} className={`rr-print-h rr-print-h--${el.level}`} />;
    }
    case "blockquote":
      return <Html as="blockquote" html={el.html} />;
    case "pullquote":
      return <Html as="aside" html={el.html} className="rr-print-pullquote" />;
    case "image":
      return <ImageBlock el={el} actions={actions} />;
    case "list": {
      const items = el.items.map((html, i) => <Html key={i} as="li" html={html} />);
      return el.ordered ? <ol start={el.start}>{items}</ol> : <ul>{items}</ul>;
    }
    case "separator":
      return <hr />;
    case "code":
      return (
        <pre className="rr-print-code">
          <code>{el.text}</code>
        </pre>
      );
    case "table":
      return <Html as="div" html={el.html} className="rr-print-table" />;
    case "embed":
      return (
        <Note kind="embed" label={placeholderText(el)}>
          {el.text ? <p className="rr-print-note__text">{el.text}</p> : null}
        </Note>
      );
    case "placeholder":
      return <Note kind={el.kind} label={placeholderText(el)} />;
  }
}

function DocHead({ doc, fallbackTitle, fallbackAuthor, partialNote }: { doc: PrintDocument; fallbackTitle: string; fallbackAuthor: string; partialNote?: string }) {
  const date = formatPrintDate(doc.date);
  const byline = [doc.author || fallbackAuthor, doc.publication, date].filter((s) => s && s.trim()).join(" · ");
  return (
    <header className="rr-print-dochead" data-nocount="">
      <h1 className="rr-print-dochead__title">{doc.title || fallbackTitle}</h1>
      {doc.subtitle ? <p className="rr-print-dochead__subtitle">{doc.subtitle}</p> : null}
      {byline ? <p className="rr-print-dochead__byline">{byline}</p> : null}
      {doc.url ? <p className="rr-print-dochead__url">{doc.url}</p> : null}
      {partialNote ? <p className="rr-print-partial">Partial printout. {partialNote}</p> : null}
    </header>
  );
}

function DocFoot({ doc, fallbackTitle, fallbackAuthor, fallbackUrl, partialNote }: { doc: PrintDocument; fallbackTitle: string; fallbackAuthor: string; fallbackUrl: string; partialNote?: string }) {
  const date = formatPrintDate(doc.date);
  const who = [doc.author || fallbackAuthor, date].filter((s) => s && s.trim()).join(" · ");
  return (
    <footer className="rr-print-docfoot" data-nocount="">
      <p className="rr-print-docfoot__title">{doc.title || fallbackTitle}</p>
      {who ? <p>{who}</p> : null}
      <p className="rr-print-docfoot__url">Source: {doc.url || fallbackUrl}</p>
      {partialNote ? <p className="rr-print-partial">Partial printout. {partialNote}</p> : null}
    </footer>
  );
}

/** One block, wrapped so its margins stay inside it (measured heights add up exactly). */
export const PrintBlock = memo(function PrintBlock({ block, actions }: { block: BlockSpec; actions: ImageActions }) {
  let inner: ReactNode;
  switch (block.kind) {
    case "head":
      inner = <DocHead doc={block.doc} fallbackTitle={block.fallbackTitle} fallbackAuthor={block.fallbackAuthor} partialNote={block.partialNote} />;
      break;
    case "foot":
      inner = (
        <DocFoot doc={block.doc} fallbackTitle={block.fallbackTitle} fallbackAuthor={block.fallbackAuthor} fallbackUrl={block.fallbackUrl} partialNote={block.partialNote} />
      );
      break;
    case "removed":
      inner =
        actions.interactive && actions.onRestore ? (
          <button
            type="button"
            className="rr-print-imgtoggle rr-print-imgtoggle--restore"
            onClick={() => actions.onRestore?.(block.src)}
            aria-label={block.label ? `Restore image: ${block.label}` : "Restore image"}
          >
            Restore image
          </button>
        ) : null;
      break;
    case "el":
      inner = <Element el={block.el} actions={actions} />;
      break;
    case "li": {
      const li = <Html as="li" html={block.list.items[block.item] ?? ""} />;
      inner = block.list.ordered ? <ol start={(block.list.start ?? 1) + block.item}>{li}</ol> : <ul>{li}</ul>;
      break;
    }
  }
  let cls = "rr-print-block";
  if (block.kind === "removed") cls += " rr-print-block--removed";
  if (block.kind === "li") {
    cls += " rr-print-block--li";
    if (block.item === 0) cls += " rr-print-block--li-first";
    if (block.item === block.list.items.length - 1) cls += " rr-print-block--li-last";
  }
  if (block.traits.atomic) cls += " rr-print-block--atomic";
  if (block.traits.keepWithNext) cls += " rr-print-block--keep";
  return (
    <div className={cls} data-block={block.id}>
      {inner}
    </div>
  );
});
