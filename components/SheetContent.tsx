import type { ReactNode } from "react";
import { ItemCard } from "@/components/ItemCard";
import type { CardData } from "@/lib/today";

export const SHEET_TITLE_ID = "sheet-title";

/** Inside of the detail sheet: label + Close, then the item card. */
export function SheetContent({
  card,
  actions,
  onClose,
}: {
  card: CardData;
  actions: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="rr-sheet__inner">
      <div className="rr-sheet__head">
        <span className="rr-label">
          {card.phase} · item {card.order}
        </span>
        <button type="button" className="rr-btn rr-btn--link" onClick={onClose}>
          Close
        </button>
      </div>
      <ItemCard
        card={card}
        size="sheet"
        titleId={SHEET_TITLE_ID}
        showStatus
        actions={actions}
      />
    </div>
  );
}
