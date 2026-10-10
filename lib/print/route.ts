// URL routing for Print (SPEC §7.4 "Coverage"): decide from a Notion `Link`
// whether to open a PDF, print an arXiv paper's HTML version, or extract a web
// page. An arXiv abstract page is never printed as if it were the paper.

import { isPrintFetchError } from "./errors";
import { safeFetch, type SafeFetchOptions, type SafeFetchResult } from "./fetch";

// classifyUrl is pure and lives in ./classify so client components can use it
// without pulling the network layer (node:dns, node:http) into the browser.
import { classifyUrl } from "./classify";
export { classifyUrl, opensAsPdf, type UrlClass, type UrlKind } from "./classify";

/** Canonical arXiv URLs for an id. A version suffix (v2) is kept. */
export function arxivCandidates(id: string): { html: string; pdf: string } {
  return { html: `https://arxiv.org/html/${id}`, pdf: `https://arxiv.org/pdf/${id}` };
}

export type FetchLike = (url: string, opts?: SafeFetchOptions) => Promise<SafeFetchResult>;

export interface RouteDeps {
  /** Defaults to safeFetch with production deps. */
  fetch?: FetchLike;
}

export type ArxivResolution =
  | { kind: "html"; url: string }
  | { kind: "pdf"; url: string; reason: "no-html-version" | "check-failed" };

/**
 * Checks whether arXiv has an HTML version of the paper.
 * 200 + text/html => html. 404/410 => pdf ('no-html-version').
 * Anything else (other status, network error, timeout, odd content type)
 * => pdf with reason 'check-failed', so the UI can say the check did not work.
 */
export async function resolveArxiv(id: string, deps: RouteDeps = {}): Promise<ArxivResolution> {
  const doFetch: FetchLike = deps.fetch ?? ((u, o) => safeFetch(u, o));
  const { html, pdf } = arxivCandidates(id);
  let res: SafeFetchResult;
  try {
    res = await doFetch(html, { method: "HEAD", timeoutMs: 8_000 });
  } catch (e) {
    if (isPrintFetchError(e) && e.code === "http-status" && (e.status === 404 || e.status === 410)) {
      return { kind: "pdf", url: pdf, reason: "no-html-version" };
    }
    return { kind: "pdf", url: pdf, reason: "check-failed" };
  }
  const mime = res.contentType.split(";")[0].trim().toLowerCase();
  if (res.status === 200 && mime === "text/html") return { kind: "html", url: html };
  return { kind: "pdf", url: pdf, reason: "check-failed" };
}

export type PrintPlan =
  | { action: "open-pdf"; url: string; reason: "direct-pdf" | "arxiv-pdf-link" | "no-html-version" | "check-failed"; arxivId?: string }
  | { action: "extract"; url: string; source: "web" | "arxiv-html"; arxivId?: string };

/** The Print decision for one Notion link. Only arXiv abstract links need the network. */
export async function printPlan(url: string, deps: RouteDeps = {}): Promise<PrintPlan> {
  const c = classifyUrl(url);
  switch (c.kind) {
    case "pdf":
      return { action: "open-pdf", url, reason: "direct-pdf" };
    case "arxiv-pdf":
      return { action: "open-pdf", url, reason: "arxiv-pdf-link", arxivId: c.arxivId };
    case "arxiv-html":
      return { action: "extract", url, source: "arxiv-html", arxivId: c.arxivId };
    case "arxiv-abs": {
      const r = await resolveArxiv(c.arxivId!, deps);
      if (r.kind === "html") return { action: "extract", url: r.url, source: "arxiv-html", arxivId: c.arxivId };
      return { action: "open-pdf", url: r.url, reason: r.reason, arxivId: c.arxivId };
    }
    default:
      return { action: "extract", url, source: "web" };
  }
}

// ---------------------------------------------------------------------------
// Substack detection (for custom-domain Substack publications)

export interface SubstackGuess {
  substack: boolean;
  reasons: string[];
}

/**
 * Pure check on raw HTML: does this page look like a Substack post?
 * Strong signals (one is enough): *.substack.com host, a Substack generator
 * meta tag, window._preloads together with any substack reference.
 * Otherwise two or more weaker markers are needed (a single substackcdn image
 * on a normal blog is not enough).
 */
export function isLikelySubstack(html: string, url: string): SubstackGuess {
  const reasons: string[] = [];
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.+$/, "");
  } catch {
    // ignore
  }
  const hostMatch = host === "substack.com" || host.endsWith(".substack.com");
  if (hostMatch) reasons.push("host");

  // Quantifiers are bounded so a huge or broken page cannot cause slow backtracking.
  const generator =
    /<meta[^>]{1,300}(?:name|property)=["'](?:generator|og:site_name)["'][^>]{0,300}content=["'][^"']{0,200}substack/i.test(html) ||
    /<meta[^>]{1,300}content=["'][^"']{0,200}substack[^"']{0,200}["'][^>]{0,300}(?:name|property)=["'](?:generator|og:site_name)["']/i.test(
      html,
    );
  if (generator) reasons.push("meta-generator");

  const cdn = /substackcdn\.com/i.test(html);
  if (cdn) reasons.push("substackcdn");

  const script =
    /<script[^>]{0,300}src=["'][^"']{0,300}substack(?:cdn)?\.com/i.test(html) || /<script[^>]{0,300}>[^<]{0,2000}substack\.com/i.test(html);
  if (script) reasons.push("script");

  const preloads = /window\._preloads/.test(html);
  if (preloads) reasons.push("window._preloads");

  if (/class=["'][^"']{0,300}\bavailable-content\b/i.test(html)) reasons.push("class:available-content");
  if (/class=["'][^"']{0,300}\bbody markup\b/i.test(html)) reasons.push("class:body-markup");

  const weak = reasons.filter((r) => r !== "host" && r !== "meta-generator").length;
  const substack = hostMatch || generator || (preloads && (cdn || script)) || weak >= 2;
  return { substack, reasons };
}
