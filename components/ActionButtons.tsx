import { CheckIcon, PlayIcon } from "@/components/Icons";
import type { Status } from "@/lib/types";

export type ActionKind = "start" | "done" | "skip" | "reset";

type Props = {
  status: Status;
  /** Offer "Back to To read" (Path detail sheet only). */
  allowReset: boolean;
  /** Show the inline "Skip this item?" step instead of the buttons. */
  confirmSkip: boolean;
  /** The action that is running, if any (all buttons are disabled then). */
  busy: ActionKind | null;
  error: string | null;
  /** Put focus on Skip (after Cancel), so keyboard users keep their place. */
  focusSkip?: boolean;
  onAction?: (kind: ActionKind) => void;
  onAskSkip?: () => void;
  onCancelSkip?: () => void;
};

/**
 * Start / Done / Skip / Back to To read, by status (SPEC §5, §7.1, §7.2):
 * - To read: Start, Done, Skip
 * - Reading: Done, Skip (+ Back to To read)
 * - Done, Skipped: Back to To read
 * Presentational: the parent (ItemActions) holds the state and runs actions.
 */
export function ActionButtons({
  status,
  allowReset,
  confirmSkip,
  busy,
  error,
  focusSkip = false,
  onAction,
  onAskSkip,
  onCancelSkip,
}: Props) {
  const disabled = busy !== null;
  const open = status === "To read" || status === "Reading";
  const errorLine = error && (
    <p className="rr-body-italic" role="alert">
      {error}
    </p>
  );

  if (confirmSkip && open) {
    return (
      <>
        <p className="rr-body">Skip this item?</p>
        <div className="rr-actions__row">
          <button
            type="button"
            className="rr-btn rr-btn--primary"
            disabled={disabled}
            onClick={() => onAction?.("skip")}
          >
            {busy === "skip" ? "Skipping…" : "Yes, skip"}
          </button>
          <button
            type="button"
            className="rr-btn rr-btn--secondary"
            disabled={disabled}
            onClick={onCancelSkip}
            // The Skip button is gone now: keep focus on the safe choice.
            autoFocus
          >
            Cancel
          </button>
        </div>
        {errorLine}
      </>
    );
  }

  const reset = (
    <button
      type="button"
      className="rr-btn rr-btn--secondary"
      disabled={disabled}
      onClick={() => onAction?.("reset")}
    >
      {busy === "reset" ? "Saving…" : "Back to To read"}
    </button>
  );

  if (!open) {
    return (
      <>
        {allowReset && <div className="rr-actions__row">{reset}</div>}
        {errorLine}
      </>
    );
  }

  return (
    <>
      <div className="rr-actions__row">
        {status === "To read" && (
          <button
            type="button"
            className="rr-btn rr-btn--secondary"
            disabled={disabled}
            onClick={() => onAction?.("start")}
          >
            <PlayIcon />
            {busy === "start" ? "Starting…" : "Start"}
          </button>
        )}
        <button
          type="button"
          className="rr-btn rr-btn--affirm"
          disabled={disabled}
          onClick={() => onAction?.("done")}
        >
          <CheckIcon />
          {busy === "done" ? "Saving…" : "Done"}
        </button>
        <button
          type="button"
          className="rr-btn rr-btn--link"
          disabled={disabled}
          onClick={onAskSkip}
          autoFocus={focusSkip}
        >
          Skip
        </button>
      </div>
      {allowReset && status === "Reading" && (
        <div className="rr-actions__row">{reset}</div>
      )}
      {errorLine}
    </>
  );
}
