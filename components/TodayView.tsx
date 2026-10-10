import type { ReactNode } from "react";
import { ItemCard } from "@/components/ItemCard";
import { ScreenHeader } from "@/components/ScreenHeader";
import { UpNext, type UpNextRow } from "@/components/UpNext";
import type { CardData } from "@/lib/today";

type Props = {
  /** "Phase 1 · item 1 of 189" or "All done". */
  context: string;
  /** The next item, or null when everything is done or skipped. */
  card: CardData | null;
  /** Action rows for the card (ItemActions in the app). */
  actions: ReactNode;
  upNext: UpNextRow[];
};

/** Today screen (board E). Presentational: plain props, no data fetching. */
export function TodayView({ context, card, actions, upNext }: Props) {
  return (
    <>
      <ScreenHeader title="Today" context={context} />
      <div className="rr-screen__body">
        {card ? (
          <>
            <ItemCard
              card={card}
              size="hero"
              titleId="today-title"
              showStatus={card.status === "Reading"}
              actions={actions}
              printFrom="today"
            />
            <UpNext rows={upNext} />
          </>
        ) : (
          <section className="rr-state">
            <h2 className="rr-display">All done. Nice work.</h2>
            <p className="rr-body-italic">
              There is nothing left to read in your path.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
