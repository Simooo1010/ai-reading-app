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

/**
 * Paper for the printout: A4, no margin (the sheets carry their own margins).
 * An @page rule cannot be limited to one screen by a selector, so it is not
 * in design-system/print.css (which stays loaded after a client-side Back):
 * PrintClient renders it in a <style> element, and it leaves with the print
 * screen. Today / Path / Progress then print with the browser defaults.
 */
export const PRINT_PAGE_RULE = "@page { size: A4; margin: 0; }";

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
