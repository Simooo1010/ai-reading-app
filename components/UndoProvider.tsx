"use client";

// Holds the "Skipped. Undo" toast. It lives above the item card, so it stays
// on screen after the page re-renders with the new next item (or with the
// empty state, if the last item was skipped).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { undoSkip } from "@/app/(app)/today/actions";

const UNDO_MS = 6000;

type Skipped = { id: string; title: string; previous: "To read" | "Reading" };

const UndoContext = createContext<(skipped: Skipped) => void>(() => {});

export function useOfferUndo() {
  return useContext(UndoContext);
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const [skipped, setSkipped] = useState<Skipped | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const offer = useCallback((s: Skipped) => {
    setError(null);
    setSkipped(s);
  }, []);

  // Hide the toast after a few seconds (not while undo is running or failed).
  useEffect(() => {
    if (!skipped || pending || error) return;
    const timer = setTimeout(() => setSkipped(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [skipped, pending, error]);

  function onUndo() {
    if (!skipped) return;
    const { id, previous } = skipped;
    startTransition(async () => {
      const result = await undoSkip(id, previous);
      if (result.ok) {
        setSkipped(null);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <UndoContext.Provider value={offer}>
      {children}
      {skipped && (
        <div className="toast" role="status" aria-live="polite">
          <p className="toast-text">
            {error ?? (
              <>
                Skipped: <strong>{skipped.title}</strong>
              </>
            )}
          </p>
          <div className="toast-actions">
            <button
              type="button"
              className="btn btn-toast"
              onClick={onUndo}
              disabled={pending}
            >
              {pending ? "Undoing…" : "Undo"}
            </button>
            {error && (
              <button
                type="button"
                className="btn btn-toast-quiet"
                onClick={() => {
                  setSkipped(null);
                  setError(null);
                }}
                disabled={pending}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </UndoContext.Provider>
  );
}
