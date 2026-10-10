import { ItemActions } from "@/components/ItemActions";
import { formatMinutes, readScope, type OpenItem } from "@/lib/today";

type Props = {
  item: OpenItem;
  /** Titles from `Paired with` (only used for 5 · Counterweights items). */
  answers: string[];
};

export function NextItemCard({ item, answers }: Props) {
  const time = formatMinutes(item.readingTimeMin);
  const scope = readScope(item.notes);
  const isCounterweight = item.layer === "5 · Counterweights";

  return (
    <article className="card next-card" aria-labelledby="next-title">
      <div className="card-top">
        <span className="eyebrow">Next to read</span>
        {item.status === "Reading" && (
          <span className="chip chip-reading">Reading</span>
        )}
      </div>

      <h2 id="next-title" className="next-title">
        {item.title}
      </h2>
      {item.author && <p className="next-author">{item.author}</p>}

      <ul className="facts" aria-label="Details">
        {time && <li>{time}</li>}
        <li>{item.difficulty}</li>
        <li>{item.phase}</li>
        <li>{item.layer}</li>
      </ul>

      {isCounterweight && answers.length > 0 && (
        <p className="answers">
          <span className="label">This answers:</span> {answers.join(" · ")}
        </p>
      )}

      {item.whyRead && (
        <section className="why">
          <h3 className="label">Why read this</h3>
          <p>{item.whyRead}</p>
        </section>
      )}

      {scope && <p className="scope">{scope}</p>}

      <a
        className="btn btn-primary btn-block"
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open source
        <span className="sr-only"> (opens in a new tab)</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      </a>

      <ItemActions
        key={item.id}
        id={item.id}
        title={item.title}
        status={item.status}
      />
    </article>
  );
}
