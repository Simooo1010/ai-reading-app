import { PathRow } from "@/components/PathRow";
import { PhaseBlock } from "@/components/PhaseBlock";
import { ScreenHeader } from "@/components/ScreenHeader";
import type { PhaseView } from "@/lib/path";

/** Path screen (board E). Presentational: plain props, no data fetching. */
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
      <ScreenHeader title="Path" context={summary} />
      <div className="rr-screen__body">
        <div className="rr-path">
          {phases.map((p) => (
            <PhaseBlock
              key={p.phase}
              listId={`phase-${p.number}`}
              title={p.phase}
              isNow={p.isNow}
              countText={p.countText}
              hoursDone={p.hoursDone}
              hoursTotal={p.hoursTotal}
              percent={p.percent}
              initiallyOpen={p.isNow}
            >
              {p.rows.map((row) => (
                <PathRow key={row.id} row={row} />
              ))}
            </PhaseBlock>
          ))}
        </div>
      </div>
    </>
  );
}
