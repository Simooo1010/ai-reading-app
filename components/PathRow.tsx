import { PrintLink } from "@/components/PrintLink";
import { StatusChip } from "@/components/StatusChip";
import { formatOrder, type PathRowData } from "@/lib/path";
import { formatMinutes } from "@/lib/today";

/**
 * One Path row (board): order, title, minutes, dotted leader, status chip.
 * A button: PathSheetHost opens the detail sheet for `data-item-id`.
 * The quiet Print icon is a sibling link (a link cannot sit inside a button).
 */
export function PathRow({ row }: { row: PathRowData }) {
  const skipped = row.status === "Skipped";
  return (
    <li className="rr-row-item">
      <button
        type="button"
        className={`rr-row rr-row--button${skipped ? " rr-row--skipped" : ""}`}
        data-item-id={row.id}
        aria-haspopup="dialog"
      >
        <span className="rr-row__order">{formatOrder(row.order)}</span>
        <span className="rr-row__body">
          <span className="rr-row__title">{row.title}</span>
          <span className="rr-row__line">
            <span className="rr-row__meta">
              {formatMinutes(row.readingTimeMin) ?? ""}
            </span>
            <span className="rr-row__leader" aria-hidden="true" />
            <StatusChip status={row.status} />
          </span>
        </span>
      </button>
      <PrintLink id={row.id} title={row.title} pdfLink={row.pdfLink} from="path" variant="icon" />
    </li>
  );
}
