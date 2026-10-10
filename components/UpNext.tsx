import { formatOrder } from "@/lib/path";
import { formatMinutes } from "@/lib/today";
import type { Item } from "@/lib/types";

export type UpNextRow = Pick<
  Item,
  "id" | "order" | "title" | "author" | "readingTimeMin" | "layer"
>;

/** "Up next": 0-3 real rows (order, title, author · time, layer chip). */
export function UpNext({ rows }: { rows: UpNextRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="rr-section" aria-labelledby="up-next-title">
      <h2 id="up-next-title" className="rr-label">
        Up next
      </h2>
      <ol className="rr-list">
        {rows.map((row) => {
          const meta = [row.author, formatMinutes(row.readingTimeMin)]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={row.id}>
              <div className="rr-row">
                <span className="rr-row__order">{formatOrder(row.order)}</span>
                <span className="rr-row__body">
                  <span className="rr-row__title">{row.title}</span>
                  <span className="rr-row__line">
                    <span className="rr-row__meta">{meta}</span>
                    <span className="rr-chip">{row.layer}</span>
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
