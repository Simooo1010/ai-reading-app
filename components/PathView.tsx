import { PathShelves } from "@/components/PathShelves";
import { ScreenHeader } from "@/components/ScreenHeader";
import type { PhaseView } from "@/lib/path";

/** Path screen (Shelf design). Presentational: plain props, no data fetching. */
export function PathView({
  summary,
  phases,
}: {
  /** "189 items · 89.3 h" */
  summary: string;
  phases: PhaseView[];
}) {
  return (
    <>
      <ScreenHeader title="The shelf" context={summary} />
      <div className="rr-screen__body">
        <PathShelves phases={phases} />
      </div>
    </>
  );
}
