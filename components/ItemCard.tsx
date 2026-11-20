import type { ReactNode } from "react";
import { ArrowUpRightIcon } from "@/components/Icons";
import { PrintLink } from "@/components/PrintLink";
import { safeHttpUrl } from "@/lib/links";
import { coverChip, coverNumeral, isCounterweight } from "@/lib/shelf";
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
  /** Screen the quiet Print link returns to. */
  printFrom: "today" | "path";
};

/**
 * Cover (Shelf design): an ink book cover with a yellow spine strip, chips,
 * the giant outlined order numeral, title, author, "why read this" and a meta
 * rail. Under it: Open source (the one yellow control), the actions and a
 * quiet Print link. Presentational: plain props, no data fetching.
 * `size` "sheet" is the smaller cover inside the detail sheet.
 */
export function ItemCard({ card, size, titleId, showStatus, actions, printFrom }: Props) {
  const time = formatMinutes(card.readingTimeMin);
  const meta = [card.type, time, card.difficulty, card.published ? card.published.slice(0, 4) : null].filter(
    (part): part is string => Boolean(part),
  );
  const sourceHref = safeHttpUrl(card.link);
  const counterweight = isCounterweight(card.layer);
  const chip = showStatus ? card.status : coverChip(card.status, card.priority);

  return (
    <div className={`rr-item rr-item--${size}`}>
      <article
        className={`rr-cover rr-cover--${size}${counterweight ? " rr-cover--hatch" : ""}`}
        aria-labelledby={titleId}
        data-cover
      >
        <span className="rr-cover__numeral" aria-hidden="true">
          {coverNumeral(card.order)}
        </span>
        <div className="rr-cover__chips">
          <span className="rr-chip rr-chip--outline">{card.layer}</span>
          <span className="rr-chip rr-chip--highlight">{chip}</span>
        </div>

        <h2
          id={titleId}
          className={`rr-cover__title${card.title.length > 38 ? " rr-cover__title--long" : ""}`}
        >
          {card.title}
        </h2>
        {card.author && <p className="rr-cover__author">by {card.author}</p>}

        {card.whyRead && <p className="rr-cover__why">{card.whyRead}</p>}
        {card.scope && <p className="rr-cover__note">{card.scope}</p>}
        {card.answers.length > 0 && (
          <p className="rr-cover__note">This answers: {card.answers.join(" · ")}</p>
        )}

        <p className="rr-cover__meta">
          {meta.map((part, i) => (
            <span key={i}>
              {i > 0 && (
                <span className="rr-sep" aria-hidden="true">
                  {" · "}
                </span>
              )}
              {part}
            </span>
          ))}
        </p>
      </article>

      <div className="rr-actions rr-item__actions">
        {sourceHref ? (
          <a
            className="rr-btn rr-btn--primary"
            href={sourceHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open source
            <span className="rr-sr-only"> (opens in a new tab)</span>
            <ArrowUpRightIcon />
          </a>
        ) : (
          // Not a web link (empty or another scheme): never an href.
          <span className="rr-btn rr-btn--primary" aria-disabled="true">
            No link to open
          </span>
        )}
        {actions}
      </div>

      {/* Quiet, secondary (SPEC §7.4): under the actions, never among them. */}
      <p className="rr-item__print">
        <PrintLink id={card.id} title={card.title} pdfLink={card.pdfLink} from={printFrom} variant="text" />
      </p>
    </div>
  );
}
