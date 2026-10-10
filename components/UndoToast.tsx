type Props = {
  /** null = nothing to show (the live region stays in the page). */
  message: string | null;
  pending: boolean;
  /** Show "Close" next to Undo (after a failed undo). */
  showClose: boolean;
  onUndo?: () => void;
  onClose?: () => void;
  onHold?: (hold: boolean) => void;
};

/**
 * "Skipped. Undo": ink bar above the tab bar (.rr-toast). The role="status"
 * region is always in the page so screen readers announce new text.
 * Presentational: UndoProvider holds the state.
 */
export function UndoToast({
  message,
  pending,
  showClose,
  onUndo,
  onClose,
  onHold,
}: Props) {
  return (
    <div className="rr-toast" role="status" aria-live="polite">
      {message !== null && (
        <div
          className="rr-toast__bar"
          onFocus={() => onHold?.(true)}
          onBlur={() => onHold?.(false)}
          onPointerEnter={() => onHold?.(true)}
          onPointerLeave={() => onHold?.(false)}
        >
          <p className="rr-toast__text">{message}</p>
          <div className="rr-toast__actions">
            <button
              type="button"
              className="rr-toast__action"
              onClick={onUndo}
              disabled={pending}
            >
              {pending ? "Undoing…" : "Undo"}
            </button>
            {showClose && (
              <button
                type="button"
                className="rr-toast__action"
                onClick={onClose}
                disabled={pending}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
