"use client";

// Start / Done / Skip buttons for the next item. Skip asks first, then the
// UndoProvider shows an Undo toast. Render with key={item.id} so the confirm
// step and errors reset when the next item changes.

import { useState, useTransition } from "react";
import {
  doneItem,
  skipItem,
  startItem,
  type ActionResult,
} from "@/app/(app)/today/actions";
import { useOfferUndo } from "@/components/UndoProvider";

type Props = {
  id: string;
  title: string;
  status: "To read" | "Reading";
};

export function ItemActions({ id, title, status }: Props) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"start" | "done" | "skip" | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offerUndo = useOfferUndo();

  function run(
    which: "start" | "done" | "skip",
    action: () => Promise<ActionResult>,
    onOk?: () => void,
  ) {
    setError(null);
    setBusy(which);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        onOk?.();
      } else {
        setError(result.error);
        setConfirmSkip(false);
      }
      setBusy(null);
    });
  }

  if (confirmSkip) {
    return (
      <div className="actions">
        <p className="confirm-text">Skip this item?</p>
        <div className="actions-row">
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={() =>
              run("skip", () => skipItem(id), () =>
                offerUndo({ id, title, previous: status }),
              )
            }
          >
            {busy === "skip" ? "Skipping…" : "Yes, skip"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => setConfirmSkip(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="actions">
      <div className="actions-row">
        {status !== "Reading" && (
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => run("start", () => startItem(id))}
          >
            {busy === "start" ? "Starting…" : "Start"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-done"
          disabled={pending}
          onClick={() => run("done", () => doneItem(id))}
        >
          {busy === "done" ? "Saving…" : "Done"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => {
            setError(null);
            setConfirmSkip(true);
          }}
        >
          Skip
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
