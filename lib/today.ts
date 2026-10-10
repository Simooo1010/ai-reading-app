// Pure logic for the Today screen (SPEC §7.1). No Notion access here.

import type { Item, Status } from "@/lib/types";

/** An item that is still "in the path" (Status Reading or To read). */
export type OpenItem = Item & { status: Extract<Status, "Reading" | "To read"> };

function isOpen(item: Item): item is OpenItem {
  return item.status === "Reading" || item.status === "To read";
}

function openByOrder(items: readonly Item[]): OpenItem[] {
  return items.filter(isOpen).sort((a, b) => a.order - b.order);
}

/** Next item = lowest `Order` with Status Reading or To read. null if none. */
export function pickNext(items: readonly Item[]): OpenItem | null {
  return openByOrder(items)[0] ?? null;
}

/** The `n` items after the next item, by `Order`, same status filter. */
export function pickUpcoming(items: readonly Item[], n = 3): OpenItem[] {
  return openByOrder(items).slice(1, 1 + n);
}

/**
 * Reading scope from `Notes`: the whole note (trimmed) when it starts with
 * "Read:", e.g. "Read: abstract, intro, conclusion". Otherwise null.
 */
export function readScope(notes: string): string | null {
  const text = notes.trim();
  return text.startsWith("Read:") ? text : null;
}

function normalizeId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

/** Titles of the items in `item.pairedWith`. Unknown ids are skipped. */
export function pairedTitles(item: Item, all: readonly Item[]): string[] {
  const byId = new Map(all.map((i) => [normalizeId(i.id), i.title]));
  return item.pairedWith.flatMap((id) => {
    const title = byId.get(normalizeId(id));
    return title === undefined ? [] : [title];
  });
}

/** Today's date in Europe/Rome as YYYY-MM-DD. */
export function todayInRome(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "30 min", "1 h 5 min", "2 h". Empty minutes → null. */
export function formatMinutes(min: number | null): string | null {
  if (min === null || !Number.isFinite(min) || min < 0) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
