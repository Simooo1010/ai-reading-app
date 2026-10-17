// Batching and shared errors for the translation engines (SPEC.md §7.4, Italian).
// Server side only. Pure, no I/O.
//
// A long article is sent as a few large requests, not hundreds of small ones:
// segments are packed in reading order into batches under a character budget
// and an item limit. A segment longer than the budget goes alone.

export const BATCH_MAX_CHARS = 6000;
export const BATCH_MAX_ITEMS = 40;

export interface BatchLimits {
  maxChars?: number;
  maxItems?: number;
}

/** Indexes of `texts`, grouped into batches (order kept). */
export function packBatches(texts: readonly string[], limits: BatchLimits = {}): number[][] {
  const maxChars = limits.maxChars ?? BATCH_MAX_CHARS;
  const maxItems = Math.max(1, limits.maxItems ?? BATCH_MAX_ITEMS);
  const out: number[][] = [];
  let cur: number[] = [];
  let chars = 0;
  texts.forEach((t, i) => {
    if (cur.length > 0 && (cur.length >= maxItems || chars + t.length > maxChars)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(i);
    chars += t.length;
  });
  if (cur.length > 0) out.push(cur);
  return out;
}

/** The engine said "too many requests" (HTTP 429, or 503 overloaded). */
export class TranslateRateLimitError extends Error {
  readonly retryAfterMs?: number;
  /** The daily quota is used up: no point in trying again today. */
  readonly daily: boolean;
  constructor(status: number, retryAfterMs: number | undefined, daily: boolean) {
    super(`rate limited (HTTP ${status}${daily ? ", daily quota" : ""})`);
    this.name = "TranslateRateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.daily = daily;
  }
}

/** Any other engine failure (HTTP error, network, an answer we cannot use). */
export class TranslateEngineError extends Error {
  /** HTTP status of the answer, when there was one. */
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "TranslateEngineError";
    this.status = status;
  }
}
