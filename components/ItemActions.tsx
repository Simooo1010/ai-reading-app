"use client";

// Runs the item actions (server actions) and holds the Skip confirm step.
// After Skip it offers Undo (UndoProvider). Render with a key that changes
// with the item and its status, so the confirm step and errors reset.

import { useState, useTransition } from "react";
import {
  doneItem,
  resetItem,
  skipItem,
  startItem,
  type ActionResult,
} from "@/app/(app)/actions";
import { ActionButtons, type ActionKind } from "@/components/ActionButtons";
import { useOfferUndo } from "@/components/UndoProvider";
import type { Status } from "@/lib/types";

const RUN: Record<ActionKind, (id: string) => Promise<ActionResult>> = {
  start: startItem,
  done: doneItem,
  skip: skipItem,
  reset: resetItem,
};

type Props = {
  id: string;
  status: Status;
  allowReset: boolean;
  /** Called after a successful Skip, before the Undo toast shows. */
  onSkipped?: () => void;
};

export function ItemActions({ id, status, allowReset, onSkipped }: Props) {
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [focusSkip, setFocusSkip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offerUndo = useOfferUndo();

  function onAction(kind: ActionKind) {
    setError(null);
    setFocusSkip(false);
    setBusy(kind);
    startTransition(async () => {
      let result: Awaited<ReturnType<(typeof RUN)[ActionKind]>>;
      try {
        result = await RUN[kind](id);
      } catch {
        // No network, or the request was cut off: show a short message here
        // instead of the full-screen error page.
        setBusy(null);
        setError("Could not save. Please try again.");
        setConfirmSkip(false);
        return;
      }
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        setConfirmSkip(false);
        return;
      }
      if (kind === "skip" && (status === "To read" || status === "Reading")) {
        setConfirmSkip(false);
        onSkipped?.();
        offerUndo({ id, previous: status });
      }
    });
  }

  return (
    <ActionButtons
      status={status}
      allowReset={allowReset}
      confirmSkip={confirmSkip}
      busy={busy}
      error={error}
      focusSkip={focusSkip}
      onAction={onAction}
      onAskSkip={() => {
        setError(null);
        setConfirmSkip(true);
      }}
      onCancelSkip={() => {
        setConfirmSkip(false);
        setFocusSkip(true);
      }}
    />
  );
}
