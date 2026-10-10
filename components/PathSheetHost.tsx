"use client";

// Opens the detail sheet when a Path row is tapped. Rows stay server-rendered:
// one click handler here finds the row by its data-item-id.
//
// Sheet = native <dialog> opened with showModal(): Esc and "Close" close it,
// focus goes back to the row, the page under it cannot scroll (CSS :has).

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ItemActions } from "@/components/ItemActions";
import { SHEET_TITLE_ID, SheetContent } from "@/components/SheetContent";
import type { CardData } from "@/lib/today";

type Props = {
  /** Card data of every item (fresh after each action). */
  cards: CardData[];
  children: ReactNode;
};

function rowButton(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-item-id="${CSS.escape(id)}"]`,
  );
}

export function PathSheetHost({ cards, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const card = openId ? (cards.find((c) => c.id === openId) ?? null) : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (card && dialog && !dialog.open) dialog.showModal();
  }, [card]);

  function onPageClick(event: MouseEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-item-id]",
    );
    const id = row?.dataset.itemId;
    if (id) setOpenId(id);
  }

  function close() {
    dialogRef.current?.close();
  }

  // Runs for Esc, "Close", a tap outside and after Skip.
  function onDialogClose() {
    const id = openId;
    setOpenId(null);
    if (id) rowButton(id)?.focus();
  }

  return (
    <div onClick={onPageClick}>
      {children}
      <dialog
        ref={dialogRef}
        className="rr-sheet"
        aria-labelledby={SHEET_TITLE_ID}
        onClose={onDialogClose}
        onClick={(event) => {
          // A tap on the faded page around the sheet closes it.
          if (event.target === event.currentTarget) close();
          event.stopPropagation();
        }}
      >
        {card && (
          <SheetContent
            card={card}
            onClose={close}
            actions={
              <ItemActions
                key={`${card.id}:${card.status}`}
                id={card.id}
                status={card.status}
                allowReset
                onSkipped={close}
              />
            }
          />
        )}
      </dialog>
    </div>
  );
}
