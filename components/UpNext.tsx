import { formatMinutes } from "@/lib/today";
import type { Item } from "@/lib/types";

export function UpNext({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section className="up-next" aria-labelledby="up-next-title">
      <h2 id="up-next-title" className="section-title">
        Up next
      </h2>
      <ol className="up-list">
        {items.map((item) => {
          const time = formatMinutes(item.readingTimeMin);
          return (
            <li key={item.id} className="up-row">
              <span className="up-title">{item.title}</span>
              <span className="up-meta">
                {time && <span className="up-time">{time}</span>}
                <span className="chip">{item.layer}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
