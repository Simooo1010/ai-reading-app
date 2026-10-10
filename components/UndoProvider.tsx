"use client";

// Holds the "Skipped. Undo" toast for 6 seconds. It lives in the app layout,
// so it stays on screen after the page re-renders (new next item on Today,
// new status on Path) and while the user changes tabs.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { undoSkip } from "@/app/(app)/actions";
import { UndoToast } from "@/components/UndoToast";

const UNDO_MS = 6000;

type Skipped = { id: string; previous: "To read" | "Reading" };

const UndoContext = createContext<(skipped: Skipped) => void>(() => {});

export function useOfferUndo() {
  return useContext(UndoContext);
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const [skipped, setSkipped] = useState<Skipped | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [held, setHeld] = useState(false);
  const [pending, startTransition] = useTransition();

  const offer = useCallback((s: Skipped) => {
    setError(null);
    setHeld(false);
    setSkipped(s);
  }, []);

  // Hide after 6 s; not while undo runs, after a failed undo, or while the
  // toast has focus or the pointer is on it.
  useEffect(() => {
    if (!skipped || pending || error || held) return;
    const timer = setTimeout(() => setSkipped(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [skipped, pending, error, held]);

  function close() {
    setSkipped(null);
    setError(null);
    setHeld(false);
  }

  function onUndo() {
    if (!skipped) return;
    const { id, previous } = skipped;
    startTransition(async () => {
      const result = await undoSkip(id, previous);
      if (result.ok) close();
      else setError(result.error);
    });
  }

  return (
    <UndoContext.Provider value={offer}>
      {children}
      <UndoToast
        message={skipped ? (error ?? "Skipped.") : null}
        pending={pending}
        showClose={error !== null}
        onUndo={onUndo}
        onClose={close}
        onHold={setHeld}
      />
    </UndoContext.Provider>
  );
}
