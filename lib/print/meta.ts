// Page metadata: JSON-LD, Open Graph / Twitter meta, citation meta.
// Pure helpers over a parsed Document.

export interface LdArticle {
  headline: string;
  description: string;
  authors: string[];
  datePublished: string;
  image: string;
  publisher: string;
  isAccessibleForFree?: boolean;
}

const ARTICLE_TYPES = new Set([
  "article",
  "newsarticle",
  "blogposting",
  "scholarlyarticle",
  "report",
  "techarticle",
  "analysisnewsarticle",
  "opinionnewsarticle",
  "reportagenewsarticle",
  "socialmediaposting",
  "webpage",
  "creativework",
  "podcastepisode",
]);

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function nameOf(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object" && "name" in v) return str((v as { name: unknown }).name);
  return "";
}

function imageOf(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.length ? imageOf(v[0]) : "";
  if (v && typeof v === "object" && "url" in v) return str((v as { url: unknown }).url);
  return "";
}

function typesOf(o: Record<string, unknown>): string[] {
  const t = o["@type"];
  if (typeof t === "string") return [t.toLowerCase()];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
  return [];
}

function collectObjects(v: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > 6 || out.length > 200) return;
  if (Array.isArray(v)) {
    for (const x of v) collectObjects(x, out, depth + 1);
    return;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    out.push(o);
    if (o["@graph"]) collectObjects(o["@graph"], out, depth + 1);
  }
}

/** The main article object from JSON-LD scripts (best match), or null. */
export function readJsonLd(doc: Document): LdArticle | null {
  const objects: Record<string, unknown>[] = [];
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    const raw = s.textContent ?? "";
    if (!raw.trim() || raw.length > 2_000_000) continue;
    try {
      collectObjects(JSON.parse(raw), objects);
    } catch {
      // ignore broken JSON-LD
    }
  }
  // Prefer specific article types over WebPage/CreativeWork.
  const ranked = objects
    .map((o) => ({ o, types: typesOf(o) }))
    .filter((x) => x.types.some((t) => ARTICLE_TYPES.has(t)))
    .sort((a, b) => score(b.types) - score(a.types));
  const best = ranked[0]?.o;
  if (!best) return null;
  const authorsRaw = best["author"] ?? best["creator"];
  const authors = (Array.isArray(authorsRaw) ? authorsRaw : authorsRaw ? [authorsRaw] : [])
    .map(nameOf)
    .filter(Boolean);
  const free = best["isAccessibleForFree"];
  const isFree =
    typeof free === "boolean" ? free : typeof free === "string" ? free.toLowerCase() !== "false" : undefined;
  return {
    headline: str(best["headline"]) || str(best["name"]),
    description: str(best["description"]),
    authors,
    datePublished: str(best["datePublished"]) || str(best["dateCreated"]),
    image: imageOf(best["image"]) || imageOf(best["thumbnailUrl"]),
    publisher: nameOf(best["publisher"]),
    isAccessibleForFree: isFree,
  };
}

function score(types: string[]): number {
  if (types.some((t) => t === "webpage" || t === "creativework")) return 0;
  return 1;
}

/** All <meta> elements of the document, in document order. */
function metasOf(doc: Document): Element[] {
  // getElementsByTagName is a plain tree walk. An attribute selector per key
  // (querySelector('meta[name="x"]')) cost seconds on 2 MB arXiv pages.
  return Array.from(doc.getElementsByTagName("meta"));
}

/** content of <meta property=..> or <meta name=..> (first non-empty). */
export function metaContent(doc: Document, ...keys: string[]): string {
  const metas = metasOf(doc);
  if (metas.length === 0) return "";
  for (const k of keys) {
    const el =
      metas.find((m) => m.getAttribute("property") === k) ??
      metas.find((m) => m.getAttribute("name") === k) ??
      metas.find((m) => m.getAttribute("itemprop") === k);
    const v = el?.getAttribute("content")?.trim();
    if (v) return v;
  }
  return "";
}

export function metaAll(doc: Document, key: string): string[] {
  return metasOf(doc)
    .filter((m) => m.getAttribute("name") === key || m.getAttribute("property") === key)
    .map((m) => (m.getAttribute("content") ?? "").trim())
    .filter(Boolean);
}

export function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Normalize a date to ISO: "YYYY-MM-DD" stays as is; date-times become
 * full ISO strings; "2020/05/08" becomes "2020-05-08"; unknown -> "".
 */
export function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    const mm = m.padStart(2, "0");
    const dd = d.padStart(2, "0");
    if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) return `${y}-${mm}-${dd}`;
    return "";
  }
  if (s.length > 100) return "";
  const t = Date.parse(s);
  if (Number.isNaN(t)) return "";
  return new Date(t).toISOString();
}

/** "Name <a@b>" / URLs are not author names. */
export function cleanAuthor(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s || /^https?:\/\//i.test(s)) return "";
  return s.slice(0, 300);
}

/** True when a description is only punctuation/ellipsis ("..."). */
export function hasLetters(s: string): boolean {
  return /[\p{L}\p{N}]/u.test(s);
}

export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function joinAuthors(names: string[]): string {
  const uniq = Array.from(new Set(names.map(cleanAuthor).filter(Boolean)));
  if (uniq.length <= 2) return uniq.join(" and ");
  return `${uniq.slice(0, -1).join(", ")} and ${uniq[uniq.length - 1]}`;
}
