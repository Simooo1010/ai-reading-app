"use client";

import { useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/Icons";

type Props = {
  /** id of the row list (aria-controls). */
  listId: string;
  title: string;
  isNow: boolean;
  countText: string;
  hoursDone: string;
  hoursTotal: string;
  percent: number;
  initiallyOpen: boolean;
  /** Server-rendered rows (<PathRow>). */
  children: ReactNode;
};

/** Collapsible phase (.rr-phase). Only the open/closed state is client side. */
export function PhaseBlock({
  listId,
  title,
  isNow,
  countText,
  hoursDone,
  hoursTotal,
  percent,
  initiallyOpen,
  children,
}: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <section className="rr-phase" aria-label={title}>
      <button
        type="button"
        className="rr-phase__toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="rr-phase__head">
          <span className="rr-phase-title">{title}</span>
          {isNow && <span className="rr-phase__now">Now</span>}
          <span className="rr-phase__chevron">
            <ChevronIcon />
          </span>
        </span>
        <span className="rr-phase__line">
          <span className="rr-phase__count">{countText}</span>
          <span className="rr-phase__hours">
            {hoursDone} <span className="rr-phase__of">of</span> {hoursTotal} h
          </span>
        </span>
        <span className="rr-progress rr-progress--sm" aria-hidden="true">
          <span
            className="rr-progress__fill"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </span>
      </button>
      <ol className="rr-list rr-list--ruled" id={listId} hidden={!open}>
        {children}
      </ol>
    </section>
  );
}
