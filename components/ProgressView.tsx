import { LayerBars } from "@/components/ProgressCharts";
import { ScreenHeader } from "@/components/ScreenHeader";
import { WeeklyHours } from "@/components/WeeklyHours";
import type { ProgressData } from "@/lib/progress";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Outlined bar with progressbar semantics (value = integer percent). */
function Meter({
  size,
  percent,
  fill,
  label,
  valueText,
}: {
  size: "sm" | "md";
  percent: number;
  fill: number;
  label: string;
  valueText: string;
}) {
  return (
    <div
      className={`rr-progress rr-progress--${size} rr-progress--outlined`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText}
      aria-label={label}
    >
      <div
        className="rr-progress__fill"
        style={{ width: `${Math.min(100, Math.max(0, fill))}%` }}
      />
    </div>
  );
}

/** Progress screen (board E). Presentational: plain props, no data fetching. */
export function ProgressView({ data }: { data: ProgressData }) {
  const { hours, streak, projection, core } = data;

  return (
    <>
      <ScreenHeader title="Progress" context={data.context} />
      <div className="rr-screen__body">
        {/* 1. Hours read + this week */}
        <section className="rr-meter" aria-labelledby="hours-title">
          <div className="rr-stat-split">
            <div className="rr-stat">
              <h2 id="hours-title" className="rr-label">
                Hours read
              </h2>
              <p className="rr-stat__number rr-stat__number--xl">
                {hours.done}
                <span className="rr-stat__unit">h</span>
              </p>
            </div>
            <div className="rr-stat rr-stat--end">
              <h2 className="rr-label">This week</h2>
              <p className="rr-stat__number rr-stat__number--md">
                {hours.thisWeek} h
              </p>
            </div>
          </div>
          <p className="rr-stat__helper rr-stat__helper--lg">
            of {hours.total} h in the whole list · {hours.percent}%
          </p>
          <Meter
            size="md"
            percent={hours.percent}
            fill={hours.fill}
            label="Hours read"
            valueText={`${hours.done} of ${hours.total} hours, ${hours.percent}%`}
          />
        </section>

        {/* 2. Streak + projected finish */}
        <div className="rr-stat-pair">
          <section className="rr-stat" aria-labelledby="streak-title">
            <h2 id="streak-title" className="rr-label">
              Streak
            </h2>
            <p className="rr-stat__number rr-stat__number--sm">{streak.text}</p>
            <p className="rr-stat__helper">{streak.helper}</p>
          </section>
          <section className="rr-stat" aria-labelledby="finish-title">
            <h2 id="finish-title" className="rr-label">
              Projected finish
            </h2>
            {projection.kind === "date" && (
              <>
                <p className="rr-stat__number rr-stat__number--sm">
                  {projection.dateText}
                </p>
                <p className="rr-stat__helper">{projection.helper}</p>
              </>
            )}
            {projection.kind === "none" && (
              <>
                <p className="rr-stat__empty">Not enough data yet</p>
                <p className="rr-stat__helper">Keep reading a few weeks</p>
              </>
            )}
            {projection.kind === "finished" && (
              <>
                <p className="rr-stat__number rr-stat__number--sm">All read</p>
                <p className="rr-stat__helper">Nothing left in the list</p>
              </>
            )}
          </section>
        </div>

        {/* 3. Hours per week (client: editable target) */}
        <WeeklyHours weeks={data.weeks} />

        {/* 4. Hours by layer */}
        <section className="rr-section" aria-labelledby="layer-title">
          <div className="rr-section__head">
            <h2 id="layer-title" className="rr-label">
              Hours by layer
            </h2>
            <span className="rr-meta-italic">done of total</span>
          </div>
          <LayerBars layers={data.layers} />
        </section>

        {/* 5. Core completion */}
        <section className="rr-section rr-meter" aria-labelledby="core-title">
          <div className="rr-section__head">
            <h2 id="core-title" className="rr-label">
              Core completion
            </h2>
            <span className="rr-meta-italic rr-num">{core.countText}</span>
          </div>
          <p className="rr-stat__number rr-stat__number--lg rr-stat__number--noted">
            {core.percent}%
            <span className="rr-stat__note">
              {core.hoursDone} of {core.hoursTotal} h
            </span>
          </p>
          <Meter
            size="sm"
            percent={core.percent}
            fill={core.fill}
            label="Core completion"
            valueText={`${core.percent}%, ${core.hoursDone} of ${core.hoursTotal} hours`}
          />
        </section>

        {/* 6. Done by priority */}
        <section className="rr-section" aria-labelledby="priority-title">
          <h2 id="priority-title" className="rr-label">
            Done by priority
          </h2>
          <ul className="rr-list rr-tally-list">
            {data.priorities.map((p) => (
              <li key={p.priority} className="rr-tally">
                <span
                  className={
                    p.priority === "Core" ? "rr-core" : "rr-label rr-label--ink"
                  }
                >
                  {p.priority}
                </span>
                <span>
                  <strong>{p.itemsDone}</strong> of {p.itemsTotal}{" "}
                  {plural(p.itemsTotal, "item", "items")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
