// Pure logic for the Progress screen (SPEC §6, §7.3). No Notion access, no
// clock: every function that needs "today" takes it as a "YYYY-MM-DD" string
// (use `todayInRome()` from lib/today.ts at the call site).
//
// Dates are handled as calendar days with UTC arithmetic on the strings
// (Date.UTC), so DST and the server's timezone can never shift a day.
//
// Hours are always summed in integer minutes and divided by 60 at the end,
// so totals never drift (0.1 + 0.2 style float errors).
//
// Rules (SPEC §6):
// - Hours read = sum of `Reading time (min)` of Done items / 60. An empty
//   reading time counts as 0 and is counted in `missingTime`.
// - Skipped items are left out of every total, percentage and projection
//   (numerator and denominator).
// - A week runs Monday to Sunday. A Done item counts in the week of its
//   `Done on`.
// - Done items with an empty `Done on` count in totals, but not in weekly
//   data, the streak or the 4-week pace.

import {
  LAYERS,
  PRIORITIES,
  type Item,
  type Layer,
  type Priority,
} from "@/lib/types";

/** The fields this module reads. A full `Item` fits. */
export type StatsItem = Pick<
  Item,
  "status" | "readingTimeMin" | "doneOn" | "layer" | "priority"
>;

// ---------- Dates (calendar days as "YYYY-MM-DD") ----------

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Normalises a Notion date to "YYYY-MM-DD". A value with a time part
 * ("2026-10-09T23:30:00.000+02:00") keeps only its first 10 characters,
 * i.e. the calendar day Notion shows. Anything else → null.
 */
export function dateOnly(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  // Reject impossible days like 2026-02-30.
  if (toDateString(ms) !== `${y}-${mo}-${d}`) return null;
  return `${y}-${mo}-${d}`;
}

function toMs(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date (expected YYYY-MM-DD): ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `date` plus `days` calendar days (negative to go back). */
export function addDays(date: string, days: number): string {
  return toDateString(toMs(date) + days * DAY_MS);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}

/** The Monday of the Monday–Sunday week that contains `date`. */
export function mondayOf(date: string): string {
  const dow = new Date(toMs(date)).getUTCDay(); // 0 = Sunday … 6 = Saturday
  return addDays(date, -((dow + 6) % 7));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Short English month name ("Oct") of a "YYYY-MM-DD" date. */
export function monthShort(date: string): string {
  return MONTHS[new Date(toMs(date)).getUTCMonth()];
}

/** "2026-10-09" → "Fri 9 Oct" (fixed English names, no Intl/timezone). */
export function formatDayShort(date: string): string {
  const d = new Date(toMs(date));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "2027-03-12" → "12 Mar 2027" (fixed English names, no Intl/timezone). */
export function formatDateLong(date: string): string {
  const d = new Date(toMs(date));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ---------- Hours ----------

/** Reading time in whole minutes; empty / invalid → 0. */
function minutesOf(item: StatsItem): number {
  const m = item.readingTimeMin;
  return typeof m === "number" && Number.isFinite(m) && m > 0 ? m : 0;
}

function hasNoTime(item: StatsItem): boolean {
  const m = item.readingTimeMin;
  return typeof m !== "number" || !Number.isFinite(m);
}

/** Exact hours from minutes (for geometry / sums). */
export function minutesToHours(min: number): number {
  return min / 60;
}

/**
 * Hours with one decimal, rounding half up, from integer minutes:
 * round(min / 6) / 10. 5355 min → 89.3 (89.25 rounds up), 315 min → 5.3.
 * (SPEC §4 says "~89.2 h" and "5.2 h": those numbers were truncated.)
 */
export function roundHours1(min: number): number {
  return Math.round(min / 6) / 10;
}

/** "89.3", "5.3", "2" (no trailing ".0"), "0". Add the unit in the UI. */
export function formatHours(min: number): string {
  return String(roundHours1(min));
}

/**
 * Integer percent 0–100 of `part / whole`. Never shows 100 before the whole
 * is complete, and never shows 0 once something is done. 0 when whole is 0.
 */
export function percent(part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0;
  if (part >= whole) return 100;
  const p = Math.round((part * 100) / whole);
  return Math.min(99, Math.max(1, p));
}

function isCounted(item: StatsItem): boolean {
  return item.status !== "Skipped";
}

function isDone(item: StatsItem): boolean {
  return item.status === "Done";
}

/** Done items that have a valid `Done on` day, with that day. */
function datedDone(items: readonly StatsItem[]): { day: string; min: number }[] {
  const out: { day: string; min: number }[] = [];
  for (const item of items) {
    if (!isDone(item)) continue;
    const day = dateOnly(item.doneOn);
    if (day !== null) out.push({ day, min: minutesOf(item) });
  }
  return out;
}

// ---------- 1. Summary ----------

export type Summary = {
  /** Done items (Skipped never counts). */
  itemsDone: number;
  /** All items except Skipped. */
  itemsTotal: number;
  minutesDone: number;
  minutesTotal: number;
  /** Exact hours (minutes / 60). Use `formatHours(minutes…)` to show them. */
  hoursDone: number;
  hoursTotal: number;
  /** Hours done / hours total, integer 0–100 (see `percent`). */
  percentHours: number;
  /** Minutes / hours of items Done in the Monday–Sunday week of `today`. */
  minutesThisWeek: number;
  hoursThisWeek: number;
  skippedCount: number;
  /** Non-Skipped items with an empty reading time (counted as 0 min). */
  missingTime: number;
  /** Done items with an empty `Done on` (in totals, not in weeks/streak). */
  doneWithoutDate: number;
};

export function summary(items: readonly StatsItem[], today: string): Summary {
  let itemsDone = 0;
  let itemsTotal = 0;
  let minutesDone = 0;
  let minutesTotal = 0;
  let skippedCount = 0;
  let missingTime = 0;
  let doneWithoutDate = 0;

  for (const item of items) {
    if (!isCounted(item)) {
      skippedCount++;
      continue;
    }
    itemsTotal++;
    minutesTotal += minutesOf(item);
    if (hasNoTime(item)) missingTime++;
    if (isDone(item)) {
      itemsDone++;
      minutesDone += minutesOf(item);
      if (dateOnly(item.doneOn) === null) doneWithoutDate++;
    }
  }

  const weekStart = mondayOf(today);
  const weekEnd = addDays(weekStart, 6);
  let minutesThisWeek = 0;
  for (const { day, min } of datedDone(items)) {
    if (day >= weekStart && day <= weekEnd) minutesThisWeek += min;
  }

  return {
    itemsDone,
    itemsTotal,
    minutesDone,
    minutesTotal,
    hoursDone: minutesToHours(minutesDone),
    hoursTotal: minutesToHours(minutesTotal),
    percentHours: percent(minutesDone, minutesTotal),
    minutesThisWeek,
    hoursThisWeek: minutesToHours(minutesThisWeek),
    skippedCount,
    missingTime,
    doneWithoutDate,
  };
}

// ---------- 2. Weekly hours ----------

export type WeekHours = {
  /** Monday of the week, "YYYY-MM-DD". */
  weekStart: string;
  minutes: number;
  hours: number;
  /** True for the week that contains `today` (always the last one). */
  isCurrent: boolean;
};

/**
 * Hours Done per Monday–Sunday week, the last `n` weeks, oldest first. The
 * week of `today` is last. Done items without `Done on` are not in here.
 */
export function weeklyHours(
  items: readonly StatsItem[],
  today: string,
  n = 8,
): WeekHours[] {
  const current = mondayOf(today);
  const weeks: WeekHours[] = [];
  const index = new Map<string, number>();
  for (let i = n - 1; i >= 0; i--) {
    const weekStart = addDays(current, -7 * i);
    index.set(weekStart, weeks.length);
    weeks.push({ weekStart, minutes: 0, hours: 0, isCurrent: i === 0 });
  }
  for (const { day, min } of datedDone(items)) {
    const i = index.get(mondayOf(day));
    if (i !== undefined) weeks[i].minutes += min;
  }
  for (const w of weeks) w.hours = minutesToHours(w.minutes);
  return weeks;
}

// ---------- 3. By layer / 4. by priority / 5. Core ----------

export type GroupHours = {
  itemsDone: number;
  itemsTotal: number;
  minutesDone: number;
  minutesTotal: number;
  hoursDone: number;
  hoursTotal: number;
};

function groupHours(items: readonly StatsItem[]): GroupHours {
  let itemsDone = 0;
  let itemsTotal = 0;
  let minutesDone = 0;
  let minutesTotal = 0;
  for (const item of items) {
    if (!isCounted(item)) continue;
    itemsTotal++;
    minutesTotal += minutesOf(item);
    if (isDone(item)) {
      itemsDone++;
      minutesDone += minutesOf(item);
    }
  }
  return {
    itemsDone,
    itemsTotal,
    minutesDone,
    minutesTotal,
    hoursDone: minutesToHours(minutesDone),
    hoursTotal: minutesToHours(minutesTotal),
  };
}

export type LayerHours = GroupHours & { layer: Layer };

/** One row per layer, in Layer order 1→5 (Skipped left out). */
export function hoursByLayer(items: readonly StatsItem[]): LayerHours[] {
  return LAYERS.map((layer) => ({
    layer,
    ...groupHours(items.filter((i) => i.layer === layer)),
  }));
}

export type PriorityDone = {
  priority: Priority;
  itemsDone: number;
  itemsTotal: number;
};

/** Done items per priority: Core, Recommended, Optional (Skipped left out). */
export function doneByPriority(items: readonly StatsItem[]): PriorityDone[] {
  return PRIORITIES.map((priority) => {
    const g = groupHours(items.filter((i) => i.priority === priority));
    return { priority, itemsDone: g.itemsDone, itemsTotal: g.itemsTotal };
  });
}

export type CoreCompletion = GroupHours & { percentHours: number };

/** Core hours done / Core hours total, Skipped left out (SPEC §7.3). */
export function coreCompletion(items: readonly StatsItem[]): CoreCompletion {
  const g = groupHours(items.filter((i) => i.priority === "Core"));
  return { ...g, percentHours: percent(g.minutesDone, g.minutesTotal) };
}

// ---------- 6. Streak ----------

export type Streak = {
  days: number;
  /** First day of the streak, "YYYY-MM-DD"; null when days is 0. */
  sinceDate: string | null;
};

/**
 * Consecutive days with at least one Done item, ending today. If nothing is
 * done yet today, the streak ends yesterday (it is not broken until the day
 * is over). 0 when neither today nor yesterday has a Done item. Days after
 * `today` are ignored.
 */
export function streak(items: readonly StatsItem[], today: string): Streak {
  const days = new Set(datedDone(items).map((d) => d.day));
  let end: string;
  if (days.has(today)) end = today;
  else if (days.has(addDays(today, -1))) end = addDays(today, -1);
  else return { days: 0, sinceDate: null };

  let start = end;
  let count = 1;
  while (days.has(addDays(start, -1))) {
    start = addDays(start, -1);
    count++;
  }
  return { days: count, sinceDate: start };
}

// ---------- 7. Projected finish ----------

/** Length of the pace window: today-27 … today, inclusive. */
export const PACE_WINDOW_DAYS = 28;

export type Projection =
  /** Average is 0: the UI shows "Not enough data yet". */
  | { kind: "none"; remainingHours: number }
  /** No item left that is not Done or Skipped. */
  | { kind: "finished" }
  | {
      kind: "date";
      /** Projected finish day, "YYYY-MM-DD" (show with `formatDateLong`). */
      date: string;
      /** Days from today to `date`. */
      days: number;
      weeklyAverage: number;
      remainingHours: number;
    };

/**
 * Projected finish at the pace of the last 4 weeks (SPEC §6).
 *
 * DECISION: "average weekly hours of the last 4 weeks" = hours Done in the
 * trailing 28 days (today-27 … today, inclusive) / 4. This has no
 * partial-week bias (a Monday would otherwise count a near-empty current
 * week) and does not depend on where the week starts.
 *
 * Remaining = items not Done and not Skipped. Finish date = today +
 * ceil(remaining / weeklyAverage × 7) days, computed in integer minutes:
 * ceil(28 × remainingMin / windowMin).
 *
 * Order of checks: no remaining item → "finished"; average 0 → "none";
 * otherwise "date". (Remaining items whose reading time is empty count as
 * 0 min, so they can give a date of today.)
 */
export function projectedFinish(
  items: readonly StatsItem[],
  today: string,
): Projection {
  let remainingItems = 0;
  let remainingMin = 0;
  for (const item of items) {
    if (!isCounted(item) || isDone(item)) continue;
    remainingItems++;
    remainingMin += minutesOf(item);
  }
  if (remainingItems === 0) return { kind: "finished" };

  const from = addDays(today, -(PACE_WINDOW_DAYS - 1));
  let windowMin = 0;
  for (const { day, min } of datedDone(items)) {
    if (day >= from && day <= today) windowMin += min;
  }
  const remainingHours = minutesToHours(remainingMin);
  if (windowMin === 0) return { kind: "none", remainingHours };

  const days = Math.ceil((PACE_WINDOW_DAYS * remainingMin) / windowMin);
  return {
    kind: "date",
    date: addDays(today, days),
    days,
    weeklyAverage: minutesToHours(windowMin) / 4,
    remainingHours,
  };
}
