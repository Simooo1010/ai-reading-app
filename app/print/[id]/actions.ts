"use server";

// Server action for "Print in Italian" (SPEC §7.4, Italian). Runs only when
// the user taps Italiano. Read-only: no Notion writes.
// Auth first (proxy.ts checks the cookie too), then the same document the
// print page shows (loadPrintableSafe, usually a cache hit), then the
// translation. Never throws and never sends raw errors to the browser.

import { requireAuth } from "@/lib/auth";
import { getItemsCached, isPageId } from "@/lib/notion";
import { loadPrintableSafe } from "@/lib/print/safe-load";
import { findItem } from "@/lib/print/screen";
import { TRANSLATE_MESSAGES, type TranslateActionResult } from "@/lib/print/translate/types";
import type { PrintStatus } from "@/lib/print/types";

/** Results with a document the user can print (blocked / failed have none to show). */
const TRANSLATABLE: ReadonlySet<PrintStatus> = new Set<PrintStatus>(["ok", "warning", "paywalled", "too-short"]);

/** Whole action, under the 60 s maxDuration of the print route. */
const TOTAL_BUDGET_MS = 50_000;
const MIN_BUDGET_MS = 5_000;

export async function translateToItalian(id: string): Promise<TranslateActionResult> {
  const started = Date.now();
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const notSupported: TranslateActionResult = { ok: false, error: TRANSLATE_MESSAGES.notSupported };
  if (!isPageId(id)) return notSupported;
  try {
    const item = findItem(await getItemsCached(), id);
    if (!item) return notSupported;
    const load = await loadPrintableSafe({
      id: item.id,
      title: item.title,
      author: item.author,
      link: item.link,
      readingTimeMin: item.readingTimeMin,
    });
    if (load.kind !== "document" || !load.result.document || !TRANSLATABLE.has(load.result.status)) {
      return notSupported;
    }
    // Lazy import: the translator pulls in jsdom (word count), like the loader.
    const { translatePrintResult } = await import("@/lib/print/translate");
    // A slow load (cold cache) leaves less time. Too little left: say "try
    // again" now (the page is then cached) instead of running past maxDuration.
    const budgetMs = TOTAL_BUDGET_MS - (Date.now() - started);
    if (budgetMs < MIN_BUDGET_MS) return { ok: false, error: TRANSLATE_MESSAGES.unavailable };
    const out = await translatePrintResult(load.result, { budgetMs });
    if ("unavailable" in out) return { ok: false, error: TRANSLATE_MESSAGES.unavailable };
    return { ok: true, result: out.result, info: out.info };
  } catch (e) {
    // Log on the server only: the error name and message, never a key.
    console.error(`print: translate failed: ${e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : "unknown"}`);
    return { ok: false, error: TRANSLATE_MESSAGES.unavailable };
  }
}
