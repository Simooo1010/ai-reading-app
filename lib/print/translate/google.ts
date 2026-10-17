// Fallback engine for "Print in Italian" (SPEC.md §7.4, Italian): the keyless
// Google Translate endpoint. Server side only. Plain fetch.
//
// Used when Gemini has no key, is cooling down, or keeps refusing. It has no
// batch contract, so each segment is its own request (5 at a time). Long
// segments are split at sentence ends (never inside a marker) and the parts
// joined again. A failed segment stays English (null); after a "too many
// requests" answer no new request is started.

import { MARK_CLOSE, MARK_OPEN } from "./mask";

const ENDPOINT = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=it&dt=t";
export const GOOGLE_CONCURRENCY = 5;
/** Characters per request (the endpoint refuses very long texts). */
export const GOOGLE_MAX_CHARS = 4000;

export interface GoogleOptions {
  fetch: typeof fetch;
  signal?: AbortSignal;
  concurrency?: number;
  log?: (message: string) => void;
}

/** Split long text at sentence ends (". " "! " "? " or a line break) into parts under `max`. */
export function splitForRequest(text: string, max = GOOGLE_MAX_CHARS): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let start = 0;
  while (text.length - start > max) {
    let cut = -1;
    let depth = 0;
    for (let i = start; i < start + max; i++) {
      const c = text[i];
      if (c === MARK_OPEN) depth++;
      else if (c === MARK_CLOSE) depth = Math.max(0, depth - 1);
      else if (depth === 0 && /\s/.test(c) && i > start && /[.!?;:\n]/.test(text[i - 1])) cut = i + 1;
    }
    if (cut < 0) {
      // No sentence end: cut at the last space outside a marker, else hard.
      for (let i = start + max - 1; i > start; i--) {
        if (/\s/.test(text[i]) && text.lastIndexOf(MARK_OPEN, i) <= text.lastIndexOf(MARK_CLOSE, i)) {
          cut = i + 1;
          break;
        }
      }
    }
    if (cut <= start) cut = start + max;
    parts.push(text.slice(start, cut));
    start = cut;
  }
  parts.push(text.slice(start));
  return parts;
}

class Stop extends Error {}

async function translateOne(text: string, opts: GoogleOptions): Promise<string> {
  let res: Response;
  try {
    res = await opts.fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ q: text }).toString(),
      signal: opts.signal,
      cache: "no-store",
    });
  } catch {
    throw new Error("network error");
  }
  if (res.status === 429 || res.status === 503) throw new Stop(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  const chunks = Array.isArray(data) && Array.isArray(data[0]) ? (data[0] as unknown[]) : null;
  if (!chunks) throw new Error("bad answer");
  const out = chunks.map((c) => (Array.isArray(c) && typeof c[0] === "string" ? c[0] : "")).join("");
  if (!out) throw new Error("empty answer");
  // Keep the spacing around the text as the source had it.
  const lead = /^\s*/.exec(text)?.[0] ?? "";
  const trail = /\s*$/.exec(text)?.[0] ?? "";
  return lead + out.trim() + trail;
}

export interface GoogleResult {
  /** One entry per text: the translation, or null (that text stays English). */
  out: (string | null)[];
  /** The endpoint said "too many requests": do not call it again in this run. */
  rateLimited: boolean;
}

/** Translate each text. Never throws. */
export async function googleTranslate(texts: readonly string[], opts: GoogleOptions): Promise<GoogleResult> {
  const log = opts.log ?? (() => {});
  const out: (string | null)[] = texts.map(() => null);
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < texts.length) {
      const i = next++;
      try {
        const parts: string[] = [];
        for (const part of splitForRequest(texts[i])) {
          if (stopped) throw new Stop("stopped");
          parts.push(await translateOne(part, opts));
        }
        out[i] = parts.join("");
      } catch (e) {
        if (e instanceof Stop) {
          if (!stopped) log(`translate: google rate limited (${e.message})`);
          stopped = true;
        } else {
          log(`translate: google failed (${e instanceof Error ? e.message : "unknown"})`);
        }
      }
    }
  };
  const n = Math.max(1, Math.min(opts.concurrency ?? GOOGLE_CONCURRENCY, texts.length));
  await Promise.all(Array.from({ length: n }, worker));
  return { out, rateLimited: stopped };
}
