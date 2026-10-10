// Pure URL classification for Print (SPEC §7.4 "Coverage"). No imports, no
// network: safe to use in client components and in lib/today.ts / lib/path.ts.
// lib/print/route.ts re-exports it next to the network-backed printPlan().

export type UrlKind = "pdf" | "arxiv-abs" | "arxiv-pdf" | "arxiv-html" | "web";

export interface UrlClass {
  kind: UrlKind;
  arxivId?: string;
}

const ARXIV_HOSTS = new Set(["arxiv.org", "www.arxiv.org", "export.arxiv.org"]);

// New style: 2301.12345 / 0704.0001 (+ optional vN).
// Old style: hep-th/9901001, math.GT/0309136, cond-mat/0102536 (+ optional vN).
const NEW_ID = String.raw`\d{4}\.\d{4,5}(?:v\d+)?`;
const OLD_ID = String.raw`[a-z][a-z-]*(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?`;
const ID = `(${NEW_ID}|${OLD_ID})`;
const ABS_RE = new RegExp(`^/abs/${ID}/?$`);
const PDF_RE = new RegExp(`^/pdf/${ID}(?:\\.pdf)?/?$`, "i");
const HTML_RE = new RegExp(`^/html/${ID}(?:/.*)?$`);

/** Pure classification from the URL alone. Unparseable URLs are 'web' (safeFetch will reject them). */
export function classifyUrl(input: string): UrlClass {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { kind: "web" };
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep raw path
  }

  if (ARXIV_HOSTS.has(host)) {
    let m = ABS_RE.exec(path);
    if (m) return { kind: "arxiv-abs", arxivId: m[1] };
    m = PDF_RE.exec(path);
    if (m) return { kind: "arxiv-pdf", arxivId: m[1].replace(/\.pdf$/i, "") };
    m = HTML_RE.exec(path);
    if (m) return { kind: "arxiv-html", arxivId: m[1] };
  }
  if (/\.pdf$/i.test(url.pathname)) return { kind: "pdf" };
  return { kind: "web" };
}

/**
 * The link to open straight away when the source is already a PDF (a direct
 * .pdf link or an arXiv /pdf/ link), else null. The quiet "Open PDF" / "Print"
 * entry points use it, so they need no network and no extra data.
 * Only http(s) links count.
 */
export function opensAsPdf(link: string): string | null {
  if (typeof link !== "string") return null;
  const trimmed = link.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  const kind = classifyUrl(trimmed).kind;
  return kind === "pdf" || kind === "arxiv-pdf" ? trimmed : null;
}

/** Adds `pdfLink` only when the link is a PDF (no key at all otherwise: fewer bytes per row). */
export function withPdfLink<T extends object>(link: string, data: T): T & { pdfLink?: string } {
  const pdf = opensAsPdf(link);
  return pdf === null ? data : { ...data, pdfLink: pdf };
}
