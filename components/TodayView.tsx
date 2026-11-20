import Link from "next/link";
import type { ReactNode } from "react";
import { ItemCard } from "@/components/ItemCard";
import { Shelf } from "@/components/Shelf";
import type { SpineData } from "@/components/Spine";
import type { CardData } from "@/lib/today";

export type ShelfPreview = {
  /** "PHASE 1 SHELF · 13 ITEMS · 6.9 H" */
  label: string;
  spines: SpineData[];
  nextId: string | null;
  /** Title of the item after the next one, or null. */
  following: string | null;
  /** Every phase as its own shelf (wide screens show them all). */
  wall: { label: string; current: boolean; spines: SpineData[] }[];
};

type Props = {
  /** "Phase 1 · item 1 of 189" or "All done". */
  context: string;
  /** "3 day streak", or null when there is none. */
  streak: string | null;
  /** The next item, or null when everything is done or skipped. */
  card: CardData | null;
  /** Action rows for the card (ItemActions in the app). */
  actions: ReactNode;
  /** The current phase as a shelf (every phase when all is done). */
  shelf: ShelfPreview | null;
};

/** Today screen (Shelf design). Presentational: plain props, no data fetching. */
export function TodayView({ context, streak, card, actions, shelf }: Props) {
  return (
    <>
      <header className="rr-header">
        <h1 className="rr-sr-only">Today</h1>
        <span className="rr-label">{context}</span>
        {streak && <span className="rr-header__context">{streak}</span>}
      </header>
      <div className="rr-screen__body">
        {card ? (
          <div className="rr-today">
            <ItemCard
              card={card}
              size="hero"
              titleId="today-title"
              showStatus={card.status === "Reading"}
              actions={actions}
              printFrom="today"
            />
            {shelf && <ShelfBlock shelf={shelf} />}
          </div>
        ) : (
          <section className="rr-state">
            <h2 className="rr-display">All read</h2>
            <p className="rr-body">There is nothing left to read in your path.</p>
            {shelf && <ShelfBlock shelf={shelf} />}
          </section>
        )}
      </div>
    </>
  );
}

function ShelfBlock({ shelf }: { shelf: ShelfPreview }) {
  return (
    <>
    <section className="rr-section rr-today__shelf rr-today__shelf--phase" aria-labelledby="shelf-preview-title">
      <div className="rr-section__head">
        <h2 id="shelf-preview-title" className="rr-label">
          {shelf.label}
        </h2>
        <Link href="/path" className="rr-btn rr-btn--link">
          Open
        </Link>
      </div>
      <Shelf spines={shelf.spines} mode="stretch" height={96} nextId={shelf.nextId} marker />
      {shelf.following && <p className="rr-mono-line">Then: {shelf.following}</p>}
    </section>
    <section className="rr-section rr-wall" aria-label="All shelves">
      {shelf.wall.map((w) => (
        <div key={w.label} className="rr-wall__shelf">
          <h2 className="rr-label">{w.label}</h2>
          <Shelf
            spines={w.spines}
            mode="stretch"
            height={w.current ? 96 : 68}
            nextId={shelf.nextId}
            marker={w.current}
          />
        </div>
      ))}
    </section>
    </>
  );
}
