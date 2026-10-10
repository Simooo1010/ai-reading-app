// Pure logic for the Path screen (SPEC §6, §7.2). No Notion access here.
//
// Hours are always computed from whole minutes: sum the minutes first, then
// divide once and round to 1 decimal (no floating-point drift from adding
// many small decimal hours).

import { pickNext } from "@/lib/today";
import type { Item, Phase } from "@/lib/types";

/** "Phase 3" → 3. */
export function phaseNumber(phase: Phase): number {
  return Number(phase.slice("Phase ".length));
}

export type PhaseGroup = {
  phase: Phase;
  number: number;
  /** Items of this phase in `Order`. */
  items: Item[];
};

/**
 * Items grouped by Phase, in phase number order, each group in `Order`.
 * Only phases that have items are returned; no item is ever dropped
 * (a Phase 6 item would get its own group).
 */
export function groupByPhase(items: readonly Item[]): PhaseGroup[] {
  const byPhase = new Map<Phase, Item[]>();
  for (const item of items) {
    const list = byPhase.get(item.phase);
    if (list) list.push(item);
    else byPhase.set(item.phase, [item]);
  }
  return [...byPhase.entries()]
    .map(([phase, list]) => ({
      phase,
      number: phaseNumber(phase),
      items: [...list].sort((a, b) => a.order - b.order),
    }))
    .sort((a, b) => a.number - b.number);
}

/** Sum of `Reading time (min)`; an empty value counts as 0. */
export function sumMinutes(items: readonly Item[]): number {
  return items.reduce((sum, item) => sum + (item.readingTimeMin ?? 0), 0);
}

/**
 * Whole minutes → hours rounded to 1 decimal, half up (89.25 → 89.3).
 * Works in tenths of an hour (minutes / 6) so the rounding is exact.
 */
export function minutesToHours(minutes: number): number {
  return Math.round(minutes / 6) / 10;
}

/** Whole minutes → "6.9" (always 1 decimal). */
export function formatHours(minutes: number): string {
  return minutesToHours(minutes).toFixed(1);
}

export type PhaseStats = {
  /** Items with Status Done. */
  itemsDone: number;
  /** Items that are not Skipped (SPEC §6: Skipped is out of all totals). */
  itemsTotal: number;
  /** Items with Status Skipped. */
  skipped: number;
  minutesDone: number;
  /** Minutes of all non-Skipped items. */
  minutesTotal: number;
  /** Hours done, 1 decimal. */
  hoursDone: number;
  /** Hours of all non-Skipped items, 1 decimal. */
  hoursTotal: number;
  /** minutesDone / minutesTotal × 100 (0 when there is nothing to read). */
  percent: number;
};

/** Progress numbers for a list of items (a phase, or the whole path). */
export function phaseStats(items: readonly Item[]): PhaseStats {
  const counted = items.filter((i) => i.status !== "Skipped");
  const done = counted.filter((i) => i.status === "Done");
  const minutesDone = sumMinutes(done);
  const minutesTotal = sumMinutes(counted);
  return {
    itemsDone: done.length,
    itemsTotal: counted.length,
    skipped: items.length - counted.length,
    minutesDone,
    minutesTotal,
    hoursDone: minutesToHours(minutesDone),
    hoursTotal: minutesToHours(minutesTotal),
    percent: minutesTotal === 0 ? 0 : (minutesDone / minutesTotal) * 100,
  };
}

/** "4 of 13 items done", plus " · 1 skipped" only when something is skipped. */
export function formatPhaseCount(stats: PhaseStats): string {
  const noun = stats.itemsTotal === 1 ? "item" : "items";
  const base = `${stats.itemsDone} of ${stats.itemsTotal} ${noun} done`;
  return stats.skipped > 0 ? `${base} · ${stats.skipped} skipped` : base;
}

/** Current phase = the phase of the Today (next) item. null when all done. */
export function currentPhase(items: readonly Item[]): Phase | null {
  return pickNext(items)?.phase ?? null;
}

/** Path header: "189 items · 89.3 h" (non-Skipped items only). */
export function formatPathSummary(items: readonly Item[]): string {
  const stats = phaseStats(items);
  const noun = stats.itemsTotal === 1 ? "item" : "items";
  return `${stats.itemsTotal} ${noun} · ${formatHours(stats.minutesTotal)} h`;
}

/** Row order number with at least 2 digits: 3 → "03", 120 → "120". */
export function formatOrder(order: number): string {
  return String(order).padStart(2, "0");
}

/** One Path row (only what the row shows). */
export type PathRowData = Pick<
  Item,
  "id" | "order" | "title" | "readingTimeMin" | "status"
>;

/** Everything a PhaseBlock shows, ready to render. */
export type PhaseView = {
  phase: Phase;
  number: number;
  /** Phase of the Today item: shows "Now" and starts open. */
  isNow: boolean;
  /** "4 of 13 items done · 1 skipped" */
  countText: string;
  /** "2.1" */
  hoursDone: string;
  /** "6.6" */
  hoursTotal: string;
  /** 0-100, for the bar width. */
  percent: number;
  rows: PathRowData[];
};

/** All phases of the Path screen, in order, with their rows and numbers. */
export function pathPhases(items: readonly Item[]): PhaseView[] {
  const now = currentPhase(items);
  return groupByPhase(items).map((group) => {
    const stats = phaseStats(group.items);
    return {
      phase: group.phase,
      number: group.number,
      isNow: group.phase === now,
      countText: formatPhaseCount(stats),
      hoursDone: formatHours(stats.minutesDone),
      hoursTotal: formatHours(stats.minutesTotal),
      percent: stats.percent,
      rows: group.items.map((i) => ({
        id: i.id,
        order: i.order,
        title: i.title,
        readingTimeMin: i.readingTimeMin,
        status: i.status,
      })),
    };
  });
}
