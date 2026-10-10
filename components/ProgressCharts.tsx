// The two Progress charts as plain inline SVG (design-system README
// "Charts"). Geometry comes from lib/charts.ts; colour only through the
// .rr-chart__* classes. Presentational: no state, no fetching.

import {
  ariaLabelForLayerBars,
  ariaLabelForWeekBars,
  layerBars,
  weekBars,
} from "@/lib/charts";
import { formatHours, type LayerHours, type WeekHours } from "@/lib/stats";

/**
 * The hatch pattern id. Only WeekBars uses hatching and it is on the page
 * once, so this matches `fill: url(#rr-hatch)` in components.css.
 */
const HATCH_ID = "rr-hatch";

export function WeekBars({
  weeks,
  targetHours,
}: {
  weeks: readonly WeekHours[];
  targetHours: number;
}) {
  const g = weekBars(weeks, targetHours);
  return (
    <svg
      className="rr-chart rr-chart--week"
      viewBox={`0 0 ${g.width} ${g.height}`}
      role="img"
      aria-label={ariaLabelForWeekBars(weeks, targetHours)}
    >
      <defs>
        <pattern
          id={HATCH_ID}
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect className="rr-chart__hatch-bg" width="5" height="5" />
          <line className="rr-chart__hatch-line" x1="0" y1="0" x2="0" y2="5" />
        </pattern>
      </defs>
      <line
        className="rr-chart__target"
        x1="0"
        y1={g.target.y}
        x2={g.width}
        y2={g.target.y}
      />
      <text
        className="rr-chart__target-label"
        x={g.target.label.x}
        y={g.target.label.y}
        textAnchor={g.target.label.anchor}
      >
        {g.target.label.text}
      </text>
      {g.bars.map((b) =>
        b.bar ? (
          <rect
            key={`bar-${b.weekStart}`}
            className={
              b.barStyle === "current"
                ? "rr-chart__bar--current"
                : "rr-chart__bar--past"
            }
            x={b.bar.x}
            y={b.bar.y}
            width={b.bar.width}
            height={b.bar.height}
          />
        ) : null,
      )}
      {g.bars.map((b) => (
        <text
          key={`value-${b.weekStart}`}
          className={
            b.value.inside
              ? "rr-chart__value rr-chart__value--on-ink"
              : "rr-chart__value"
          }
          x={b.cx}
          y={b.value.y}
          textAnchor="middle"
        >
          {b.value.text}
        </text>
      ))}
      <line
        className="rr-chart__baseline"
        x1="0"
        y1={g.baselineY}
        x2={g.width}
        y2={g.baselineY}
      />
      {g.bars.map((b) => (
        <text
          key={`tick-${b.weekStart}`}
          className={
            b.isCurrent
              ? "rr-chart__tick rr-chart__tick--current"
              : "rr-chart__tick"
          }
          x={b.cx}
          y={b.tick.y}
          textAnchor="middle"
        >
          {b.tick.text}
        </text>
      ))}
      {g.bars.map((b) =>
        b.month ? (
          <text
            key={`month-${b.weekStart}`}
            className={
              b.isCurrent
                ? "rr-chart__month rr-chart__month--current"
                : "rr-chart__month"
            }
            x={b.cx}
            y={b.month.y}
            textAnchor="middle"
          >
            {b.month.text}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function LayerBars({ layers }: { layers: readonly LayerHours[] }) {
  const g = layerBars(layers);
  return (
    <svg
      className="rr-chart rr-chart--layers"
      viewBox={`0 0 ${g.width} ${g.height}`}
      role="img"
      aria-label={ariaLabelForLayerBars(layers)}
    >
      {g.rows.map((r, i) => {
        const l = layers[i];
        return (
          <g key={r.layer}>
            {/* Board shows the full layer name, number included. */}
            <text className="rr-chart__series" x="0" y={r.labelY}>
              {r.layer}
            </text>
            <text
              className="rr-chart__series-value"
              x={g.width}
              y={r.labelY}
              textAnchor="end"
            >
              <tspan className="rr-chart__strong">
                {formatHours(l.minutesDone)}
              </tspan>
              {` of ${formatHours(l.minutesTotal)} h`}
            </text>
            {r.trackWidth > 1 && (
              // Outline drawn inside the 10px track, as on the board.
              <rect
                className="rr-chart__track"
                x="0.5"
                y={r.trackY + 0.5}
                width={Math.round((r.trackWidth - 1) * 10) / 10}
                height={r.trackHeight - 1}
                rx="1"
              />
            )}
            {r.fillWidth > 0 && (
              <rect
                className="rr-chart__fill"
                x="0"
                y={r.trackY}
                width={r.fillWidth}
                height={r.trackHeight}
                rx="1"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
