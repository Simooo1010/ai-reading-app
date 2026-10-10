// Pure geometry for the two inline-SVG charts on the Progress screen,
// following design-system/README.md "Charts". No React, no colours: the
// component maps each part to its `.rr-chart__*` class.
//
// All coordinates are rounded to 0.1 px so the markup stays short and
// stable (e.g. slot 6 bar x 266.375 → 266.4, as in the README example).

import {
  formatHours,
  monthShort,
  roundHours1,
  type LayerHours,
  type WeekHours,
} from "@/lib/stats";

/** Default weekly target in hours (SPEC §7.3). */
export const DEFAULT_TARGET_HOURS = 5;

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------- WeekBars ----------

/** Chart box: viewBox "0 0 342 182". */
export const WEEK_CHART = {
  width: 342,
  height: 182,
  /** Bars stand on y 142; the 1px baseline line is drawn at 142.5. */
  barBottom: 142,
  baselineY: 142.5,
  /** Plot height above the bars' bottom (y 2 … 142). */
  plotHeight: 140,
  /** max(target, tallest week) × 1.4 must fit in the plot. */
  headroom: 1.4,
  pastBarWidth: 23,
  currentBarWidth: 24,
  /** Value label baseline 6px above a bar. */
  valueGap: 6,
  /** Value label inside the current bar: baseline this far below its top. */
  valueInsideOffset: 16,
  /** The current bar holds its label only from this height (13px text). */
  valueInsideMinHeight: 22,
  tickY: 160,
  monthY: 176,
  /** Target label baseline 8px above the target line, right-aligned. */
  targetLabelGap: 8,
} as const;

export type WeekBar = {
  weekStart: string;
  isCurrent: boolean;
  /** Slot centre (bar centre, labels and ticks use it). */
  cx: number;
  /** The bar; null for an empty week (only the "0" label is drawn). */
  bar: { x: number; y: number; width: number; height: number } | null;
  /** Hatched + outlined (past) or solid ink (current). */
  barStyle: "past" | "current";
  /** Value label, text-anchor "middle" at x = cx. */
  value: { text: string; y: number; inside: boolean };
  /** Monday's day of month, at y 160. */
  tick: { text: string; y: number };
  /** Short month, italic at y 176: on the first tick and when it changes. */
  month: { text: string; y: number } | null;
};

export type WeekBarsGeometry = {
  width: number;
  height: number;
  /** Pixels per hour. */
  scale: number;
  baselineY: number;
  target: {
    hours: number;
    y: number;
    label: { text: string; x: number; y: number };
  };
  bars: WeekBar[];
};

/** A usable target in hours: finite and > 0, else the default 5 h. */
export function normalizeTarget(targetHours: number): number {
  return Number.isFinite(targetHours) && targetHours > 0
    ? targetHours
    : DEFAULT_TARGET_HOURS;
}

/** "5" → "Target 5 h", 2.5 → "Target 2.5 h". */
function targetText(hours: number): string {
  return `Target ${Math.round(hours * 10) / 10} h`;
}

/**
 * Everything the WeekBars SVG needs.
 *
 * Scale: plotHeight / (max(target, tallest week) × 1.4), i.e.
 * 100 / max(target, tallest week) px per hour. For the 5 h target this is
 * the README's 20 px per hour; a taller week or a larger target shrinks it,
 * a smaller target makes it larger, so the target always sits at the same
 * height unless a week is above it.
 */
export function weekBars(
  weeks: readonly WeekHours[],
  targetHours: number = DEFAULT_TARGET_HOURS,
): WeekBarsGeometry {
  const C = WEEK_CHART;
  const target = normalizeTarget(targetHours);
  const tallest = Math.max(0, ...weeks.map((w) => w.hours));
  const scale = C.plotHeight / (Math.max(target, tallest) * C.headroom);
  const slot = C.width / Math.max(1, weeks.length);

  const bars = weeks.map((w, i): WeekBar => {
    const cx = slot * i + slot / 2;
    const width = w.isCurrent ? C.currentBarWidth : C.pastBarWidth;
    const height = w.minutes > 0 ? w.hours * scale : 0;
    const top = C.barBottom - height;
    const bar =
      height > 0
        ? { x: r1(cx - width / 2), y: r1(top), width, height: r1(height) }
        : null;

    const inside =
      bar !== null && w.isCurrent && height >= C.valueInsideMinHeight;
    const valueY = inside
      ? top + C.valueInsideOffset
      : (bar ? top : C.barBottom) - C.valueGap;

    const prev = i > 0 ? weeks[i - 1] : null;
    const month = monthShort(w.weekStart);
    const showMonth = prev === null || monthShort(prev.weekStart) !== month;

    return {
      weekStart: w.weekStart,
      isCurrent: w.isCurrent,
      cx: r1(cx),
      bar,
      barStyle: w.isCurrent ? "current" : "past",
      value: { text: formatHours(w.minutes), y: r1(valueY), inside },
      tick: { text: String(Number(w.weekStart.slice(8, 10))), y: C.tickY },
      month: showMonth ? { text: month, y: C.monthY } : null,
    };
  });

  const targetY = r1(C.barBottom - target * scale);
  return {
    width: C.width,
    height: C.height,
    scale,
    baselineY: C.baselineY,
    target: {
      hours: target,
      y: targetY,
      label: {
        text: targetText(target),
        x: C.width,
        y: r1(targetY - C.targetLabelGap),
      },
    },
    bars,
  };
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function hoursWords(min: number): string {
  const h = roundHours1(min);
  return `${h} ${plural(h, "hour", "hours")}`;
}

/** "Hours read per week, last 8 weeks, target 5 hours. Week of 17 Aug: …" */
export function ariaLabelForWeekBars(
  weeks: readonly WeekHours[],
  targetHours: number = DEFAULT_TARGET_HOURS,
): string {
  const target = Math.round(normalizeTarget(targetHours) * 10) / 10;
  const parts = weeks.map((w) => {
    const day = Number(w.weekStart.slice(8, 10));
    const name = w.isCurrent ? "This week" : `Week of ${day} ${monthShort(w.weekStart)}`;
    return `${name}: ${hoursWords(w.minutes)}.`;
  });
  return [
    `Hours read per week, last ${weeks.length} ${plural(weeks.length, "week", "weeks")}, target ${target} ${plural(target, "hour", "hours")}.`,
    ...parts,
  ].join(" ");
}

// ---------- LayerBars ----------

export const LAYER_CHART = {
  width: 342,
  rowHeight: 48,
  /** Label + "done of total h" baseline inside a row. */
  labelY: 16,
  trackY: 24,
  trackHeight: 10,
  trackRadius: 1,
} as const;

export type LayerBar = {
  layer: LayerHours["layer"];
  /** Layer name without the "1 · " number, e.g. "Foundations". */
  label: string;
  /** "1.2 of 5.3 h" */
  valueText: string;
  /** Top of the row. */
  y: number;
  labelY: number;
  trackY: number;
  trackHeight: number;
  /** Proportional to the layer total; the largest layer is full width. */
  trackWidth: number;
  /** Done part of the track (0 when nothing is done). */
  fillWidth: number;
};

export type LayerBarsGeometry = {
  width: number;
  height: number;
  rows: LayerBar[];
};

/** Layer name without its number prefix: "3 · Species" → "Species". */
export function layerName(layer: string): string {
  return layer.replace(/^\d+\s*·\s*/, "");
}

export function layerBars(rows: readonly LayerHours[]): LayerBarsGeometry {
  const C = LAYER_CHART;
  const largest = Math.max(0, ...rows.map((r) => r.minutesTotal));
  return {
    width: C.width,
    height: rows.length * C.rowHeight,
    rows: rows.map((r, i) => {
      const y = i * C.rowHeight;
      const trackWidth = largest > 0 ? (C.width * r.minutesTotal) / largest : 0;
      const fillWidth =
        r.minutesTotal > 0
          ? (trackWidth * Math.min(r.minutesDone, r.minutesTotal)) / r.minutesTotal
          : 0;
      return {
        layer: r.layer,
        label: layerName(r.layer),
        valueText: `${formatHours(r.minutesDone)} of ${formatHours(r.minutesTotal)} h`,
        y,
        labelY: y + C.labelY,
        trackY: y + C.trackY,
        trackHeight: C.trackHeight,
        trackWidth: r1(trackWidth),
        fillWidth: r1(fillWidth),
      };
    }),
  };
}

/** "Hours read by layer, done of total. Foundations: 1.2 of 5.3 hours. …" */
export function ariaLabelForLayerBars(rows: readonly LayerHours[]): string {
  return [
    "Hours read by layer, done of total.",
    ...rows.map(
      (r) =>
        `${layerName(r.layer)}: ${roundHours1(r.minutesDone)} of ${hoursWords(r.minutesTotal)}.`,
    ),
  ].join(" ");
}
