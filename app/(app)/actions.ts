"use server";

// Server actions for Today and Path. Each one changes only `Status`
// (and `Done on`) through lib/notion.ts, then expires the "items" cache so
// the page re-render in the same response shows the new data.

import { updateTag } from "next/cache";
import {
  ITEMS_TAG,
  isPageId,
  updateItemStatus,
} from "@/lib/notion";
import { todayInRome } from "@/lib/today";
import type { Status } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function setStatus(id: unknown, status: Status): Promise<ActionResult> {
  if (!isPageId(id)) {
    return { ok: false, error: "This item is not valid. Please reload." };
  }
  try {
    await updateItemStatus(id, status, todayInRome());
  } catch (err) {
    // Log on the server only. Never send raw errors to the browser.
    console.error("updateItemStatus failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Could not save. Please try again." };
  }
  updateTag(ITEMS_TAG);
  return { ok: true };
}

export async function startItem(id: string): Promise<ActionResult> {
  return setStatus(id, "Reading");
}

export async function doneItem(id: string): Promise<ActionResult> {
  return setStatus(id, "Done");
}

export async function skipItem(id: string): Promise<ActionResult> {
  return setStatus(id, "Skipped");
}

/**
 * "Back to To read" (Path detail sheet): Status = To read. Leaving Done
 * clears `Done on` (SPEC §5, done by buildStatusUpdate).
 */
export async function resetItem(id: string): Promise<ActionResult> {
  return setStatus(id, "To read");
}

/**
 * Undo a Skip: put back the status the item had before. Only Reading and
 * To read are allowed, because Skip is only offered on those items.
 */
export async function undoSkip(
  id: string,
  previous: string,
): Promise<ActionResult> {
  if (previous !== "Reading" && previous !== "To read") {
    return { ok: false, error: "Could not undo. Please reload." };
  }
  return setStatus(id, previous);
}
