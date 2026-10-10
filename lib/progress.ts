// Pure view model for the Progress screen (SPEC §6, §7.3). No Notion access,
// no clock: `today` ("YYYY-MM-DD", from todayInRome()) is passed in.
// All numbers come from lib/stats.ts; this module only turns them into the
// strings and percents the screen shows.

import { DEFAULT_TARGET_HOURS, normalizeTarget } from "@/lib/charts";
import {
  coreCompletion,
  doneByPriority,
  formatDateLong,
  formatDayShort,
  formatHours,
  hoursByLayer,
  projectedFinish,
  streak,
  summary,
  weeklyHours,
  type LayerHours,
  type PriorityDone,
  type StatsItem,
  type WeekHours,
} from "@/lib/stats";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Exact share 0–100 for a bar width (0 when the whole is 0). */
export function fillPercent(part: number, whole: number): number {
  if (!(whole > 0) || !(part > 0)) return 0;
  return Math.min(100, (part * 100) / whole);
}

export type ProjectionView =
  | { kind: "date"; dateText: string; helper: string }
  | { kind: "none" }
  | { kind: "finished" };

export type ProgressData = {
  /** Header: "0 of 189 items done" (Skipped left out). */
  context: string;
  hours: {
    /** "89.3" style strings, no unit. */
    done: string;
    thisWeek: string;
    total: string;
    /** Integer 0–100 (never 100 before all is done). */
    percent: number;
    /** Exact share for the bar width. */
    fill: number;
  };
  streak: { days: number; text: string; helper: string };
  projection: ProjectionView;
  /** Last 8 weeks, oldest first, this week last. */
  weeks: WeekHours[];
  layers: LayerHours[];
  core: {
    itemsDone: number;
    itemsTotal: number;
    /** "3 of 43 items" */
    countText: string;
    percent: number;
    fill: number;
    hoursDone: string;
    hoursTotal: string;
  };
  priorities: PriorityDone[];
};

/** "0 days", "1 day", "4 days". */
export function formatStreakDays(days: number): string {
  return `${days} ${plural(days, "day", "days")}`;
}

/**
 * Average weekly pace of the projection, with its unit: "2.6 h" (1 decimal,
 * half up), or "3 min" below 0.1 h a week (QA LOW-1: "0 h a week" for a pace
 * of 2.5 minutes). weeklyAverage = window minutes / 60 / 4, so × 240 gives
 * the window minutes back (rounded to undo float error) and / 4 the weekly
 * minutes.
 */
export function formatWeeklyPace(weeklyAverage: number): string {
  const weeklyMinutes = Math.round(weeklyAverage * 240) / 4;
  if (weeklyMinutes < 6) {
    // A pace above 0 never shows as "0 min".
    const min = weeklyMinutes > 0 ? Math.max(1, Math.round(weeklyMinutes)) : 0;
    return `${min} min`;
  }
  return `${formatHours(weeklyMinutes)} h`;
}

export function progressData(
  items: readonly StatsItem[],
  today: string,
): ProgressData {
  const s = summary(items, today);
  const st = streak(items, today);
  const p = projectedFinish(items, today);
  const core = coreCompletion(items);

  let projection: ProjectionView;
  if (p.kind === "date") {
    projection = {
      kind: "date",
      dateText: formatDateLong(p.date),
      helper: `at your pace of ${formatWeeklyPace(p.weeklyAverage)} a week`,
    };
  } else {
    projection = { kind: p.kind };
  }

  return {
    context: `${s.itemsDone} of ${s.itemsTotal} ${plural(s.itemsTotal, "item", "items")} done`,
    hours: {
      done: formatHours(s.minutesDone),
      thisWeek: formatHours(s.minutesThisWeek),
      total: formatHours(s.minutesTotal),
      percent: s.percentHours,
      fill: fillPercent(s.minutesDone, s.minutesTotal),
    },
    streak: {
      days: st.days,
      text: formatStreakDays(st.days),
      helper:
        st.days > 0 && st.sinceDate
          ? `since ${formatDayShort(st.sinceDate)}`
          : "Read something today to start",
    },
    projection,
    weeks: weeklyHours(items, today, 8),
    layers: hoursByLayer(items),
    core: {
      itemsDone: core.itemsDone,
      itemsTotal: core.itemsTotal,
      countText: `${core.itemsDone} of ${core.itemsTotal} ${plural(core.itemsTotal, "item", "items")}`,
      percent: core.percentHours,
      fill: fillPercent(core.minutesDone, core.minutesTotal),
      hoursDone: formatHours(core.minutesDone),
      hoursTotal: formatHours(core.minutesTotal),
    },
    priorities: doneByPriority(items),
  };
}

// ---------- Weekly target (stored in localStorage by the client) ----------

export const TARGET_STORAGE_KEY = "rr-weekly-target-hours";
export const TARGET_MIN = 0.5;
export const TARGET_MAX = 40;
export const TARGET_STEP = 0.5;

export type TargetParse =
  | { ok: true; hours: number }
  | { ok: false; error: string };

export const TARGET_RANGE_ERROR = "Enter a number from 0.5 to 40.";
export const TARGET_STEP_ERROR = "Use whole or half hours, like 4 or 4.5.";

/**
 * What the user typed in the target field → hours, or a B1 error message.
 * Accepts a comma as the decimal mark ("4,5"), since the iPhone keyboard
 * may show one.
 */
export function parseTargetInput(raw: string): TargetParse {
  const text = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(text)) {
    return { ok: false, error: TARGET_RANGE_ERROR };
  }
  const n = Number(text);
  if (!Number.isFinite(n) || n < TARGET_MIN || n > TARGET_MAX) {
    return { ok: false, error: TARGET_RANGE_ERROR };
  }
  if (Math.abs(n / TARGET_STEP - Math.round(n / TARGET_STEP)) > 1e-9) {
    return { ok: false, error: TARGET_STEP_ERROR };
  }
  return { ok: true, hours: n };
}

/**
 * A value read back from storage → a usable target. Anything missing,
 * broken or out of range gives the default (via normalizeTarget).
 */
export function parseStoredTarget(raw: string | null | undefined): number {
  if (typeof raw !== "string") return DEFAULT_TARGET_HOURS;
  const parsed = parseTargetInput(raw);
  return normalizeTarget(parsed.ok ? parsed.hours : Number.NaN);
}

/** 5 → "5", 4.5 → "4.5": the value put in the input when it opens. */
export function formatTarget(hours: number): string {
  return String(Math.round(hours * 10) / 10);
}
