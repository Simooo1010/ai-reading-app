// Pure geometry and status rules for the "Shelf" UI (spine = one item).
// WIDTH = reading time, HEIGHT = difficulty, FILL = status.

import type { Difficulty, Layer, Status } from "@/lib/types";

/** Shelf height used by a difficulty (share of the shelf height). */
export const DIFFICULTY_HEIGHT: Record<Difficulty, number> = {
  Easy: 0.55,
  Medium: 0.76,
  Hard: 1,
};

/** Skipped spines are drawn at 40% height, dashed. */
export const SKIPPED_HEIGHT = 0.4;

/** Counterweight layer = hatched spine. */
export const COUNTERWEIGHT: Layer = "5 · Counterweights";

/** Spine width in px on a scrolling shelf: 5 + minutes × 0.22 (min 5). */
export function spineWidth(minutes: number | null): number {
  const m = minutes !== null && Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  return Math.round((5 + m * 0.22) * 100) / 100;
}

/** Height of a spine, 0-1 of the shelf height, from difficulty and status. */
export function spineHeight(difficulty: Difficulty, status: Status): number {
  return status === "Skipped" ? SKIPPED_HEIGHT : DIFFICULTY_HEIGHT[difficulty];
}

export type SpineFill = "todo" | "active" | "done" | "skipped";

/**
 * Fill pattern of a spine. To read = outlined, Reading or the next item =
 * yellow, Done = solid ink, Skipped = dashed. `isNext` marks the item shown on Today.
 */
export function spineFill(status: Status, isNext: boolean): SpineFill {
  if (status === "Done") return "done";
  if (status === "Skipped") return "skipped";
  if (status === "Reading" || isNext) return "active";
  return "todo";
}

export function isCounterweight(layer: Layer): boolean {
  return layer === COUNTERWEIGHT;
}

/** Order numeral for the cover: 1 → "001", 189 → "189". */
export function coverNumeral(order: number): string {
  return String(order).padStart(3, "0");
}

/** The chip next to the layer chip on a cover: status when under way or over, else priority. */
export function coverChip(status: Status, priority: string): string {
  return status === "To read" ? priority : status;
}

/** Accessible name of a spine: "03, The Bitter Lesson, 10 min, Easy, To read". */
export function spineLabel(
  order: number,
  title: string,
  minutes: number | null,
  difficulty: Difficulty,
  status: Status,
): string {
  const time = minutes === null ? null : `${minutes} min`;
  return [String(order).padStart(2, "0"), title, time, difficulty, status]
    .filter(Boolean)
    .join(", ");
}

/** Move a selection by `delta` inside a list of ids; stays inside the list. */
export function moveSelection(ids: readonly string[], current: string | null, delta: number): string | null {
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  const to = Math.min(ids.length - 1, Math.max(0, (at < 0 ? (delta > 0 ? -1 : ids.length) : at) + delta));
  return ids[to];
}
