// Substack-aware path (SPEC.md §7.4). Free content area only, widgets removed
// on purpose and counted, paywall detected and reported (never a silent
// half-printout). Selectors learned from Pressroom's parser; behaviour fixed
// where Pressroom was wrong (see SPEC "What not to copy from Pressroom").

import { convertContent, type ConvertResult } from "./convert";
import { visibleText } from "./fidelity";
import {
  cleanAuthor,
  hasLetters,
  hostLabel,
  joinAuthors,
  metaContent,
  normalizeDate,
  readJsonLd,
  subtitleUnlessRepeated,
  textOf,
  type LdArticle,
} from "./meta";
import type { PrintDocument } from "./types";

/** Substack widgets removed on purpose (counted as removed-widget, not as loss). */
export const SUBSTACK_WIDGETS = [
  ".subscription-widget-wrap",
  ".subscription-widget-wrap-editor",
  ".subscription-widget",
  ".subscribe-widget",
  ".paywall-jump",
  ".footer-wrap",
  ".post-footer",
  ".share-dialog",
  ".like-button-container",
  ".custom-theme-background",
  ".button-wrapper",
  ".captioned-button-wrap",
  ".install-substack-app-embed",
  "[data-component-name=SubscribeWidget]",
  "[data-component-name=ButtonCreateButton]",
];

export function isSubstackHost(url: string): boolean {
  const h = hostLabel(url);
  return h === "substack.com" || h.endsWith(".substack.com");
}

/** Substack detection from the URL and from markers in the page. */
export function isSubstack(doc: Document, html: string, url: string): boolean {
  if (isSubstackHost(url)) return true;
  const generator = metaContent(doc, "generator").toLowerCase();
  if (generator.includes("substack")) return true;
  const hasArea = doc.querySelector(".available-content, .body.markup") !== null;
  if (!hasArea) return false;
  const head = html.length > 400_000 ? html.slice(0, 400_000) + html.slice(-200_000) : html;
  return head.includes("substackcdn.com") || head.includes("window._preloads");
}

/** Substack Notes (out of scope for Print v1). */
export function isSubstackNoteUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    // "/note/c-123" is Substack's own Note id format (also on custom domains).
    if (/\/note\/c-\d+/.test(u.pathname)) return true;
    if (!(h === "substack.com" || h.endsWith(".substack.com"))) return false;
    return /^\/@[^/]+\/note\//.test(u.pathname) || /^\/note\//.test(u.pathname) || /^\/notes\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

const PAYWALL_TEXT = [
  /this post is for paid subscribers/i,
  /this post is for paying subscribers/i,
  /this episode is for paid subscribers/i,
  /paid subscribers only/i,
  /keep reading with a 7-day free trial/i,
  /subscribe to .{1,80} to keep reading this post/i,
  /upgrade to paid to (keep|continue) reading/i,
];

export interface PaywallSignal {
  paywalled: boolean;
  markers: string[];
}

/**
 * Paywall markers. Text phrases are checked only in VISIBLE text (Substack's
 * embedded JSON always contains "paid subscribers" for the publication badge).
 */
export function detectSubstackPaywall(doc: Document, ld: LdArticle | null): PaywallSignal {
  const markers: string[] = [];
  if (ld?.isAccessibleForFree === false) markers.push("JSON-LD isAccessibleForFree=false");
  if (doc.querySelector(".paywall, .paywall-title, .paywall-content, [data-component-name=Paywall]")) {
    markers.push("paywall element");
  }
  const jump = doc.querySelector(".paywall-jump") !== null;
  if (jump) markers.push("paywall-jump element");
  // Phrases count only near the paywall (paywall-like blocks and what follows the free
  // content area), never inside the post itself: an author may write "paid subscribers only".
  const zones: Element[] = Array.from(doc.querySelectorAll('[class*="paywall"], [data-component-name*="Paywall"]'));
  const area = doc.querySelector(".available-content");
  for (let sib = area?.nextElementSibling ?? null, i = 0; sib && i < 10; sib = sib.nextElementSibling, i++) zones.push(sib);
  const zoneText = zones.map((z) => visibleText(z)).join(" ");
  for (const re of PAYWALL_TEXT) {
    if (re.test(zoneText)) {
      markers.push(`text "${re.source.replace(/\\/g, "")}"`);
      break;
    }
  }
  // A paywall-jump alone appears in posts whose paid part follows; trust it unless JSON-LD says the post is free.
  const strong = markers.some((m) => m !== "paywall-jump element");
  const paywalled = strong || (jump && ld?.isAccessibleForFree !== true);
  return { paywalled, markers };
}

export interface SubstackExtraction {
  document: PrintDocument;
  /** The content node after cleaning (widgets removed), as converted. */
  contentNode: Element;
  convert: ConvertResult;
  paywall: PaywallSignal;
  details: string[];
}

/** Returns null when the page has no Substack content area (caller falls back to the generic path). */
export function extractSubstack(doc: Document, url: string, baseUrl: string): SubstackExtraction | null {
  const area = doc.querySelector(".available-content") ?? doc.querySelector(".body.markup");
  if (!area) return null;
  const ld = readJsonLd(doc);
  const paywall = detectSubstackPaywall(doc, ld);
  const details: string[] = [`Content: Substack ${area.matches(".available-content") ? ".available-content" : ".body.markup"}.`];

  const node = area.cloneNode(true) as Element;
  const convert = convertContent(node, { baseUrl, widgetSelectors: SUBSTACK_WIDGETS });

  // ── Metadata: JSON-LD, then meta tags, then Pressroom's selectors ──
  const title = (
    ld?.headline ||
    textOf(doc.querySelector("h1.post-title")) ||
    textOf(doc.querySelector(".post-title")) ||
    metaContent(doc, "og:title", "twitter:title") ||
    (doc.title ?? "")
  )
    .replace(/\s+/g, " ")
    .trim();

  const domSubtitle = [
    textOf(doc.querySelector("h3.subtitle")),
    textOf(doc.querySelector(".subtitle")),
    textOf(doc.querySelector(".post-subtitle")),
  ].find((d) => d && hasLetters(d));
  const desc = [ld?.description ?? "", metaContent(doc, "og:description", "twitter:description", "description")].find(
    (d) => d && hasLetters(d),
  );
  const subtitle = domSubtitle || desc || "";

  let author = ld?.authors.length ? joinAuthors(ld.authors) : "";
  if (!author) author = cleanAuthor(metaContent(doc, "author"));
  if (!author) author = textOf(doc.querySelector('.pencraft[data-testid="AuthorName"]'));
  if (!author) author = textOf(doc.querySelector(".author-name"));
  if (!author) author = textOf(doc.querySelector(".post-header .profile-hover-card-target"));

  const docTitle = (doc.title ?? "").trim();
  const fromTitle = docTitle.includes(" - ") ? docTitle.split(" - ").pop()?.trim() ?? "" : "";
  const publication =
    metaContent(doc, "og:site_name") ||
    ld?.publisher ||
    textOf(doc.querySelector(".publication-name")) ||
    textOf(doc.querySelector(".navbar-title")) ||
    fromTitle ||
    hostLabel(url);

  const date = normalizeDate(
    ld?.datePublished ||
      doc.querySelector("time[datetime]")?.getAttribute("datetime") ||
      metaContent(doc, "article:published_time", "date") ||
      "",
  );

  const heroRaw = ld?.image || metaContent(doc, "og:image");
  let heroImage: string | undefined;
  try {
    const u = heroRaw ? new URL(heroRaw, baseUrl) : null;
    if (u && (u.protocol === "https:" || u.protocol === "http:")) heroImage = u.href.replace(/^http:/, "https:");
  } catch {
    heroImage = undefined;
  }

  const document: PrintDocument = {
    url,
    title,
    subtitle: subtitleUnlessRepeated(subtitle, convert.elements, doc),
    author,
    publication,
    date,
    elements: convert.elements,
  };
  if (heroImage) document.heroImage = heroImage;
  if (paywall.paywalled) details.push(`Paywall markers: ${paywall.markers.join(", ")}.`);
  return { document, contentNode: node, convert, paywall, details };
}
