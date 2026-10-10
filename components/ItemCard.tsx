import type { ReactNode } from "react";
import { ArrowUpRightIcon } from "@/components/Icons";
import { StatusChip } from "@/components/StatusChip";
import { formatMinutes, type CardData } from "@/lib/today";

type Props = {
  card: CardData;
  /** "hero" = Today (48px title), "sheet" = detail sheet (28px title). */
  size: "hero" | "sheet";
  /** id of the title, for aria-labelledby. */
  titleId: string;
  /** Show the status chip next to the layer chip. */
  showStatus: boolean;
  /** Action rows (Start / Done / Skip …), shown under "Open source". */
  actions: ReactNode;
};

/**
 * Item card (Today board): chips, title, "by Author", meta line, Why read
 * this (+ reading scope and "This answers" as italic lines), Open source and
 * the actions. Presentational: plain props, no data fetching.
 */
export function ItemCard({ card, size, titleId, showStatus, actions }: Props) {
  const time = formatMinutes(card.readingTimeMin);
  const meta = [card.type, time, card.difficulty, card.phase].filter(
    (part): part is string => Boolean(part),
  );
  const hasNotes = Boolean(card.whyRead || card.scope || card.answers.length);

  return (
    <article className="rr-item" aria-labelledby={titleId}>
      <div className="rr-item__chips">
        <span className="rr-chip rr-chip--hero">{card.layer}</span>
        {card.priority === "Core" && <span className="rr-core">Core</span>}
        {showStatus && <StatusChip status={card.status} />}
      </div>

      <h2
        id={titleId}
        className={`rr-item__title ${size === "hero" ? "rr-display" : "rr-phase-title"}`}
      >
        {card.title}
      </h2>
      {card.author && <p className="rr-author rr-item__author">by {card.author}</p>}

      <p className="rr-meta rr-meta-line rr-item__meta">
        {meta.map((part, i) => (
          <span key={i} className="rr-meta-line">
            {i > 0 && (
              <span className="rr-sep" aria-hidden="true">
                ·
              </span>
            )}
            <span>{part}</span>
          </span>
        ))}
      </p>

      {hasNotes && (
        <section className="rr-section rr-section--hair rr-item__why">
          {card.whyRead && (
            <>
              <h3 className="rr-label">Why read this</h3>
              <p className="rr-body">{card.whyRead}</p>
            </>
          )}
          {card.scope && <p className="rr-meta-italic rr-item__note">{card.scope}</p>}
          {card.answers.length > 0 && (
            <p className="rr-meta-italic rr-item__note">
              This answers: {card.answers.join(" · ")}
            </p>
          )}
        </section>
      )}

      <div className="rr-actions rr-item__actions">
        <a
          className="rr-btn rr-btn--primary"
          href={card.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open source
          <span className="rr-sr-only"> (opens in a new tab)</span>
          <ArrowUpRightIcon />
        </a>
        {actions}
      </div>
    </article>
  );
}
