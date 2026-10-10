// Pure helpers for the print route (app/print/[id]/page.tsx). No I/O.

import type { Item } from "../types";

export type PrintFrom = "today" | "path";

const BACK: Record<PrintFrom, { href: string; label: string }> = {
  today: { href: "/today", label: "Back to Today" },
  path: { href: "/path", label: "Back to Path" },
};

/** `from` search param -> whitelisted back link (default Today). */
export function printFrom(raw: unknown): PrintFrom {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "path" ? "path" : "today";
}

export function backLink(from: PrintFrom): { href: string; label: string } {
  return BACK[from];
}

/** URL of the print page for an item (what the quiet "Print" links point to). */
export function printHref(id: string, from: PrintFrom): string {
  return `/print/${encodeURIComponent(id)}?from=${from}`;
}

function normId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

/** The item with this Notion page id (dashes and case ignored), or null. */
export function findItem<T extends Pick<Item, "id">>(items: readonly T[], id: string): T | null {
  const want = normId(id);
  return items.find((i) => normId(i.id) === want) ?? null;
}
