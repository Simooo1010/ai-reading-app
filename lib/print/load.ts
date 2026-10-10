// Print loader (SPEC §7.4): one Notion item -> what the print page shows.
// Server side only. Never throws. The result is plain JSON-safe data.
//
// Flow: validate the item's `Link` (the only URL ever fetched; http(s) only)
// -> printPlan() (PDF, arXiv HTML version, or web page) -> safeFetch() ->
// extractPrintable(). Good results are cached per URL for 24 h; failures,
// 'blocked' and 'failed' results are never cached (fidelity rule 7).
// SERVER ONLY: never import this file from a "use client" component (it pulls
// in node:dns / node:http through fetch.ts). No `server-only` package, as in
// lib/notion.ts (no new dependencies).

import { createPrintCache, type PrintCache } from "./cache";
import { isPrintFetchError } from "./errors";
import { extractPrintable, type ExtractOptions } from "./extract";
import { safeFetch, type SafeFetchResult } from "./fetch";
import { printPlan, type PrintPlan } from "./route";
import type { PrintResult, PrintStatus } from "./types";

export type PrintItemInput = {
  id: string;
  title: string;
  author: string;
  link: string;
  readingTimeMin: number | null;
};

export type OpenPdfReason = "direct-pdf" | "arxiv-pdf-link" | "no-html-version" | "check-failed";

export type PrintLoad =
  | { kind: "document"; result: PrintResult }
  | { kind: "open-pdf"; url: string; reason: OpenPdfReason; message: string }
  | { kind: "error"; message: string; openUrl: string; code?: string };

/** Simple English (B1) for the open-pdf screen. */
export const OPEN_PDF_MESSAGES: Record<OpenPdfReason, string> = {
  "direct-pdf": "This source is a PDF. It is already ready to print.",
  "arxiv-pdf-link": "This source is a PDF. It is already ready to print.",
  "no-html-version": "This paper has no web version we can print. The PDF is ready to print.",
  "check-failed": "We could not check for a web version of this paper. The PDF is ready to print.",
};

export const LOAD_MESSAGES = {
  noLink: "This item has no web link we can print.",
  unexpected: "Something went wrong while getting the page. Please try again later.",
  notText: "We could not read this page. Open the source instead.",
} as const;

/** Only these results are kept in the cache. 'blocked' and 'failed' are tried again next time. */
const CACHEABLE: ReadonlySet<PrintStatus> = new Set<PrintStatus>(["ok", "warning", "paywalled", "too-short"]);

type Cached = Extract<PrintLoad, { kind: "document" | "open-pdf" }>;

export function isCacheableLoad(value: Cached): boolean {
  // A failed arXiv check is tried again next time.
  if (value.kind === "open-pdf") return value.reason !== "check-failed";
  return CACHEABLE.has(value.result.status);
}

/** One cache per server instance (best effort on serverless, see cache.ts). */
const sharedCache: PrintCache<Cached> = createPrintCache<Cached>({ isCacheable: isCacheableLoad });

export type PrintPageFetch = (url: string) => Promise<SafeFetchResult>;

export interface LoadDeps {
  /** Page download. Default: safeFetch with production settings (15 s timeout, size limit, no private addresses). */
  fetch?: PrintPageFetch;
  /** Default: printPlan() from route.ts (may HEAD arxiv.org for /abs/ links). */
  plan?: (url: string) => Promise<PrintPlan>;
  extract?: (html: string, url: string, opts: ExtractOptions) => PrintResult;
  cache?: PrintCache<Cached>;
  /** Milliseconds; only used to log slow loads. */
  clock?: () => number;
  /** Server log (no secrets are ever passed in). */
  log?: (message: string) => void;
}

/** http(s) URL from the Notion `Link`, or null. */
export function validLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const trimmed = link.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "?";
  }
}

const defaultFetch: PrintPageFetch = (url) => safeFetch(url); // production deps only, never test hooks

function isPdfResponse(res: SafeFetchResult): boolean {
  const mime = res.contentType.split(";")[0].trim().toLowerCase();
  if (mime === "application/pdf") return true;
  const b = res.bytes;
  return res.text === undefined && b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
}

export async function loadPrintable(item: PrintItemInput, deps: LoadDeps = {}): Promise<PrintLoad> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const clock = deps.clock ?? Date.now;
  const started = clock();
  const openUrl = typeof item.link === "string" ? item.link.trim() : "";

  const link = validLink(item.link);
  if (!link) {
    return { kind: "error", message: LOAD_MESSAGES.noLink, openUrl: validLink(openUrl) ? openUrl : "", code: "bad-url" };
  }

  try {
    const doFetch = deps.fetch ?? defaultFetch;
    const extract = deps.extract ?? extractPrintable;
    const cache = deps.cache ?? sharedCache;
    const plan = deps.plan ?? ((u: string) => printPlan(u));
    const expectedMinutes =
      typeof item.readingTimeMin === "number" && Number.isFinite(item.readingTimeMin) && item.readingTimeMin > 0
        ? item.readingTimeMin
        : undefined;

    // Keyed by the Notion link, so the arXiv "is there an HTML version?" check
    // is cached together with the result (except when that check failed).
    const value = await cache.cachedParse(link, async (): Promise<Cached> => {
      const p = await plan(link);
      if (p.action === "open-pdf") {
        return { kind: "open-pdf", url: p.url, reason: p.reason, message: OPEN_PDF_MESSAGES[p.reason] };
      }
      const res = await doFetch(p.url);
      if (isPdfResponse(res)) {
        // A web link that turned out to be a PDF.
        return { kind: "open-pdf", url: res.finalUrl, reason: "direct-pdf", message: OPEN_PDF_MESSAGES["direct-pdf"] };
      }
      if (res.text === undefined) throw new NotTextError();
      // arXiv redirects /html/<id> to /html/<id>v1/: the extractor wants no trailing slash.
      const finalUrl = p.source === "arxiv-html" ? res.finalUrl.replace(/\/+$/, "") : res.finalUrl;
      const opts: ExtractOptions = { httpStatus: res.status, expectedMinutes };
      if (p.source === "arxiv-html") opts.source = "arxiv-html";
      return { kind: "document", result: extract(res.text, finalUrl, opts) };
    });

    const took = clock() - started;
    if (took > 8_000) log(`print: slow load (${took} ms) for host ${hostOf(link)}`);
    return value;
  } catch (e) {
    if (isPrintFetchError(e)) {
      log(`print: fetch failed for host ${hostOf(link)}: ${e.code}${e.status ? ` ${e.status}` : ""}`);
      return { kind: "error", message: e.userMessage, openUrl: link, code: e.code === "http-status" && e.status ? `http-${e.status}` : e.code };
    }
    if (e instanceof NotTextError) {
      return { kind: "error", message: LOAD_MESSAGES.notText, openUrl: link, code: "not-text" };
    }
    const why = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : "unknown";
    log(`print: unexpected error for host ${hostOf(link)}: ${why}`);
    return { kind: "error", message: LOAD_MESSAGES.unexpected, openUrl: link, code: "unexpected" };
  }
}

class NotTextError extends Error {
  constructor() {
    super("response has no text");
    this.name = "NotTextError";
  }
}
