"use client";

// STUB: replaced by agent B2 (the real print screen: pages, controls, print).
// Only here so the server route compiles and can be tested. No logic that matters.

import type { JSX } from "react";
import type { PrintResult } from "@/lib/print/types";

export type PrintItemInfo = { id: string; title: string; author: string; link: string; readingTimeMin: number | null };

export default function PrintClient(props: { item: PrintItemInfo; result: PrintResult; backHref: string }): JSX.Element {
  const { item, result, backHref } = props;
  const c = result.check;
  return (
    <div className="rr-screen__body" data-print-stub="">
      <h1 className="rr-phase-title">{item.title}</h1>
      <p className="rr-meta" data-status={result.status}>Status: {result.status}</p>
      <p className="rr-body">{result.message}</p>
      <p className="rr-meta-italic">
        Words: {c.wordsFound} found, {c.wordsPrinted} printed. Images: {c.imagesKept} of {c.imagesFound}. Tables: {c.tablesKept} of {c.tablesFound}.
      </p>
      <a className="rr-btn rr-btn--link" href={backHref}>Back</a>
    </div>
  );
}
