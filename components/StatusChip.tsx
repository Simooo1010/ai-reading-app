import type { Status } from "@/lib/types";

const STATUS_CLASS: Record<Status, string> = {
  Done: "rr-status--done",
  Reading: "rr-status--reading",
  "To read": "rr-status--todo",
  Skipped: "rr-status--skipped",
};

/** Status chip: shape + word, never colour only (.rr-status). */
export function StatusChip({ status }: { status: Status }) {
  return <span className={`rr-status ${STATUS_CLASS[status]}`}>{status}</span>;
}
