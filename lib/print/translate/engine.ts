// Translation engine with rate-limit handling (SPEC.md §7.4, Italian).
// Server side only. Never throws.
//
// The free Gemini tier answers "too many requests" often, so calls are paced
// on purpose instead of left to chance:
//   - Gemini calls run one at a time per server instance, with a minimum gap
//     between them (default 6 s, env TRANSLATE_MIN_GAP_MS);
//   - a refused batch is tried up to 3 times, waiting what the server asks
//     (Retry-After / RetryInfo) or an exponential backoff with jitter;
//   - everything fits a time budget (default 50 s, under the 60 s maxDuration
//     of the print route): what is not done by then stays English (partial);
//   - circuit breaker: a used-up DAILY quota stops Gemini calls for 1 hour;
//     a batch still refused after its retries, or a refused key / unknown
//     model (HTTP 400/401/403/404), stops them for 1 minute;
//   - fallback: a batch Gemini cannot do (no key, breaker open, retries used
//     up, an answer we cannot use) goes to the keyless Google endpoint.
// A segment cache (24 h, 5000 entries, keyed by a hash of the masked text)
// makes a second try re-translate only the parts that are still missing.
//
// Module state (limiter, breaker, cache) lives in the memory of ONE server
// instance, like lib/print/cache.ts: best effort, never relied on.
// Time, sleep, random and fetch are injectable (tests use fakes; no network).

import { createHash } from "node:crypto";
import { createPrintCache, type PrintCache } from "../cache";
import { packBatches, TranslateEngineError, TranslateRateLimitError, type BatchLimits } from "./batch";
import { geminiModel, geminiTranslate } from "./gemini";
import { googleTranslate } from "./google";
import type { TranslationEngine } from "./types";

export const DEFAULT_MIN_GAP_MS = 6000;
export const DEFAULT_BUDGET_MS = 50_000;
export const MAX_TRIES = 3;
export const BACKOFF_BASE_MS = 2000;
export const JITTER_MS = 1000;
export const DAILY_COOLDOWN_MS = 60 * 60 * 1000;
export const RATE_COOLDOWN_MS = 60 * 1000;
/** Gemini answers that mean "key, model or account not usable" (not about one batch). */
const CONFIG_ERRORS: ReadonlySet<number> = new Set([400, 401, 403, 404]);
/** No Gemini call is started with less time than this left in the budget. */
export const MIN_CALL_MS = 3000;
/** Upper bound for one Gemini request. */
export const GEMINI_TIMEOUT_MS = 40_000;
export const SEGMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const SEGMENT_CACHE_MAX = 5000;

export interface CachedSegment {
  text: string;
  engine: TranslationEngine;
}

export interface TranslateState {
  /** When the last Gemini call started (ms). */
  lastGeminiAt: number;
  /** Tail of the one-at-a-time queue for Gemini calls. */
  queue: Promise<void>;
  /** Gemini is not called before this time (ms). */
  breakerUntil: number;
  segments: PrintCache<CachedSegment>;
}

export function createTranslateState(now: () => number = Date.now): TranslateState {
  return {
    lastGeminiAt: -Infinity,
    queue: Promise.resolve(),
    breakerUntil: 0,
    segments: createPrintCache<CachedSegment>({ ttlMs: SEGMENT_CACHE_TTL_MS, maxEntries: SEGMENT_CACHE_MAX, now }),
  };
}

const sharedState = createTranslateState();

export interface TranslateEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  TRANSLATE_MIN_GAP_MS?: string;
}

export interface TranslateDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Server log (never gets the key: only short reasons). */
  log?: (message: string) => void;
  /** Default: process.env. */
  env?: TranslateEnv;
  /** Default: the module state shared by all requests of this instance. */
  state?: TranslateState;
  /** Total time for the whole translation. Default 50 s. */
  budgetMs?: number;
  batch?: BatchLimits;
}

/** Accepts a translator's answer for text i (markers kept, sane length...). */
export type Validate = (index: number, translated: string) => boolean;

export interface EngineResult {
  /** One entry per input text: the accepted translation, or null (stays English). */
  out: (string | null)[];
  engines: TranslationEngine[];
}

export function segmentKey(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function minGap(env: TranslateEnv): number {
  const v = Number(env.TRANSLATE_MIN_GAP_MS);
  return env.TRANSLATE_MIN_GAP_MS?.trim() && Number.isFinite(v) && v >= 0 ? v : DEFAULT_MIN_GAP_MS;
}

/** Run `fn` after every Gemini call queued before it (one at a time per instance). */
function serial<T>(state: TranslateState, fn: () => Promise<T>): Promise<T> {
  const p = state.queue.then(fn);
  state.queue = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

/**
 * Translate `texts` (masked segments) to Italian. Never throws.
 * Gemini first (paced, retried), Google per batch as fallback.
 */
export async function translateTexts(texts: readonly string[], validate: Validate, deps: TranslateDeps = {}): Promise<EngineResult> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const random = deps.random ?? Math.random;
  const log = deps.log ?? ((m: string) => console.warn(m));
  const doFetch = deps.fetch ?? fetch;
  const env: TranslateEnv = deps.env ?? {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    TRANSLATE_MIN_GAP_MS: process.env.TRANSLATE_MIN_GAP_MS,
  };
  const state = deps.state ?? sharedState;
  const deadline = now() + (deps.budgetMs ?? DEFAULT_BUDGET_MS);
  const apiKey = env.GEMINI_API_KEY?.trim() ?? "";
  const model = geminiModel(env.GEMINI_MODEL);
  const gap = minGap(env);

  const out: (string | null)[] = texts.map(() => null);
  const engines = new Set<TranslationEngine>();
  const accept = (i: number, value: string, engine: TranslationEngine): boolean => {
    if (!validate(i, value)) return false;
    out[i] = value;
    engines.add(engine);
    state.segments.set(segmentKey(texts[i]), { text: value, engine });
    return true;
  };

  // 1. Segment cache: only the missing parts are sent.
  const missing: number[] = [];
  texts.forEach((t, i) => {
    const hit = state.segments.get(segmentKey(t));
    if (hit && validate(i, hit.text)) {
      out[i] = hit.text;
      engines.add(hit.engine);
    } else missing.push(i);
  });

  if (!apiKey && missing.length > 0) log("translate: no GEMINI_API_KEY, using the fallback engine");

  /** One Gemini call, paced. "late" = not started (budget). */
  const callGemini = (batch: string[]) =>
    serial(state, async (): Promise<{ ok: string[] } | { error: unknown } | "late"> => {
      const wait = Math.max(0, state.lastGeminiAt + gap - now());
      if (now() + wait > deadline - MIN_CALL_MS) return "late";
      if (wait > 0) await sleep(wait);
      state.lastGeminiAt = now();
      const timeout = Math.max(1000, Math.min(GEMINI_TIMEOUT_MS, deadline - now()));
      try {
        return { ok: await geminiTranslate(batch, { apiKey, model, fetch: doFetch, signal: AbortSignal.timeout(timeout), now }) };
      } catch (error) {
        return { error };
      }
    });

  /** Gemini with retries. null = use the fallback for this batch. */
  const geminiBatch = async (batch: string[]): Promise<string[] | null> => {
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      if (now() < state.breakerUntil) return null;
      const res = await callGemini(batch);
      if (res === "late") return null;
      if ("ok" in res) return res.ok;
      const err = res.error;
      if (!(err instanceof TranslateRateLimitError)) {
        log(`translate: ${err instanceof TranslateEngineError ? err.message : "gemini failed"}`);
        // A refused key, an unknown model or a region refusal (HTTP 400/401/403/404)
        // will not change in this run: stop Gemini calls, so each batch does not
        // lose the 6 s gap and a request for nothing.
        if (err instanceof TranslateEngineError && err.status !== undefined && CONFIG_ERRORS.has(err.status)) {
          state.breakerUntil = Math.max(state.breakerUntil, now() + RATE_COOLDOWN_MS);
        }
        return null;
      }
      if (err.daily) {
        log("translate: gemini daily quota used up, pausing gemini for 1 hour");
        state.breakerUntil = now() + DAILY_COOLDOWN_MS;
        return null;
      }
      const backoff = BACKOFF_BASE_MS * 2 ** attempt + Math.floor(random() * JITTER_MS);
      const delay = Math.max(err.retryAfterMs ?? 0, backoff);
      if (attempt === MAX_TRIES - 1 || now() + delay > deadline - MIN_CALL_MS) {
        log(`translate: gemini ${err.message}, pausing gemini for 1 minute`);
        state.breakerUntil = Math.max(state.breakerUntil, now() + RATE_COOLDOWN_MS);
        return null;
      }
      log(`translate: gemini ${err.message}, try ${attempt + 2} of ${MAX_TRIES} in ${Math.round(delay / 1000)} s`);
      await sleep(delay);
    }
    return null;
  };

  // 2. Batches in reading order, until the budget is used.
  const batches = packBatches(
    missing.map((i) => texts[i]),
    deps.batch,
  ).map((b) => b.map((j) => missing[j]));
  let googleStopped = false;
  for (const batch of batches) {
    if (now() >= deadline) {
      log("translate: time budget used up, the rest stays English");
      break;
    }
    let pending = batch;
    if (apiKey && now() >= state.breakerUntil) {
      const res = await geminiBatch(batch.map((i) => texts[i]));
      if (res) {
        pending = batch.filter((i, k) => !accept(i, res[k], "gemini"));
        if (pending.length > 0) log(`translate: ${pending.length} gemini answers lost markers, trying the fallback`);
      }
    }
    if (pending.length === 0 || googleStopped || now() >= deadline) continue;
    const res = await googleTranslate(
      pending.map((i) => texts[i]),
      { fetch: doFetch, signal: AbortSignal.timeout(Math.max(1000, deadline - now())), log },
    );
    pending.forEach((i, k) => {
      const v = res.out[k];
      if (v !== null) accept(i, v, "google");
    });
    if (res.rateLimited) googleStopped = true;
  }

  return { out, engines: [...engines] };
}
