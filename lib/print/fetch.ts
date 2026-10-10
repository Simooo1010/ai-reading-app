// Safe fetch for third-party pages that the Print feature downloads (SPEC §7.4).
//
// Server-only. The caller guarantees the URL comes from the Notion `Link`
// property; this module enforces everything else:
//   - only http: / https:, no user:pass@ credentials, ports 80/443 only;
//   - the host must not be (or resolve to) a private, loopback, link-local,
//     CGNAT, multicast, documentation or otherwise reserved address
//     (IPv4 and IPv6, incl. IPv4-mapped IPv6). If ANY resolved address is bad
//     the request is refused;
//   - DNS-rebinding defence: we resolve once, validate, then connect to that
//     exact address (see "IP pinning" below);
//   - redirects are followed by hand (max 5) and every hop is validated again;
//   - total timeout (default 15 s) and a size limit enforced while streaming.
//
// IP pinning — why node:http(s) and not global fetch:
//   Node 22's global fetch is undici. Pinning an address there needs an undici
//   `Agent({ connect: { lookup } })`, and `undici` is not a dependency of this
//   app (we may not add one). node:http/https accept a `lookup` option on the
//   request: the socket connects to the address we return, while the URL's
//   hostname is still used for the Host header and for TLS SNI + certificate
//   checks. So TLS stays correct and the address cannot change between the
//   check and the connect. Because we use node:http, we decompress
//   gzip / deflate / br ourselves with node:zlib (a Node built-in).
//
// Test hook: `SafeFetchDeps.testOnly` lets tests talk to an in-process server
// on 127.0.0.1 with a random port. App code must NEVER pass `testOnly` (or any
// `deps`); production callers use `safeFetch(url, opts)` only. A unit test
// checks that the default deps refuse 127.0.0.1.

import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { pipeline, Readable } from "node:stream";
import zlib from "node:zlib";
import { PrintFetchError } from "./errors";

// ---------------------------------------------------------------------------
// Types

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface TransportRequest {
  url: URL;
  /** The validated address the socket must connect to. */
  address: ResolvedAddress;
  method: "GET" | "HEAD";
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface TransportResponse {
  status: number;
  /** Lower-case header names. */
  headers: Record<string, string | undefined>;
  /** Raw (possibly compressed) body. */
  body: AsyncIterable<Uint8Array>;
  /** Stop reading and free the connection. Must be safe to call twice. */
  cancel(): void;
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  /** Extra request headers (e.g. Range). Host, Cookie, Authorization and proxy headers are ignored. */
  headers?: Record<string, string>;
  /** Total time for the whole call, redirects included. Default 15 000 ms. */
  timeoutMs?: number;
  /** Max decoded body size for non-PDF responses. Default 8 MB. */
  maxHtmlBytes?: number;
  /** Max decoded body size for PDF responses. Default 25 MB. */
  maxPdfBytes?: number;
  /** Default 5. */
  maxRedirects?: number;
  /** Allowed MIME types (no parameters). A missing Content-Type is allowed. */
  allowedContentTypes?: readonly string[];
  /** Optional outside abort signal. */
  signal?: AbortSignal;
}

export interface SafeFetchDeps {
  resolve?: Resolver;
  transport?: Transport;
  /**
   * TESTS ONLY. Never set by app code. Lets a test reach an in-process server
   * on loopback (127.0.0.1 / ::1 only — other private ranges stay blocked)
   * and on the given extra ports.
   */
  testOnly?: { allowLoopback?: boolean; extraPorts?: readonly number[] };
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  /** Full Content-Type header value ('' if missing). */
  contentType: string;
  bytes: Uint8Array;
  /** Decoded text for text/* and XHTML responses. Not set for PDFs. */
  text?: string;
  truncated: false;
}

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_HTML_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_PDF_BYTES = 25 * 1024 * 1024;
export const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_ALLOWED_CONTENT_TYPES: readonly string[] = [
  "text/html",
  "application/xhtml+xml",
  "application/pdf",
  "text/plain",
];

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br",
};

const FORBIDDEN_EXTRA_HEADERS = new Set(["host", "cookie", "authorization", "connection", "content-length", "transfer-encoding"]);

// ---------------------------------------------------------------------------
// IP address classification

/** Strict dotted-quad parser (the WHATWG URL parser already normalises
 *  decimal / hex / octal / short forms like 2130706433 or 0x7f.1). */
export function parseIPv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/** Parses an IPv6 address (optionally in brackets, optionally with a zone id
 *  and an embedded dotted IPv4 tail) into 8 16-bit words. */
export function parseIPv6(input: string): number[] | null {
  let s = input;
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const pct = s.indexOf("%");
  if (pct !== -1) s = s.slice(0, pct);
  if (!s.includes(":")) return null;

  // Embedded IPv4 tail (e.g. ::ffff:127.0.0.1) -> two hex words (::ffff:7f00:1).
  const lastColon = s.lastIndexOf(":");
  const maybeV4 = s.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const v4 = parseIPv4(maybeV4);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (h: string): number[] | null => {
    if (h === "") return [];
    const out: number[] = [];
    for (const g of h.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = parseHalf(halves[0]);
  const rest = halves.length === 2 ? parseHalf(halves[1]) : [];
  if (!head || !rest) return null;

  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return null;
    return [...head, ...new Array<number>(fill).fill(0), ...rest];
  }
  return head.length === 8 ? head : null;
}

type Cidr4 = [number, number, number, number, number];

// Special-purpose IPv4 ranges (IANA registry + multicast + reserved).
const BLOCKED_V4: Cidr4[] = [
  [0, 0, 0, 0, 8], // "this network", incl. 0.0.0.0
  [10, 0, 0, 0, 8], // private
  [100, 64, 0, 0, 10], // CGNAT
  [127, 0, 0, 0, 8], // loopback
  [169, 254, 0, 0, 16], // link-local, incl. 169.254.169.254 cloud metadata
  [172, 16, 0, 0, 12], // private
  [192, 0, 0, 0, 24], // IETF protocol assignments
  [192, 0, 2, 0, 24], // TEST-NET-1
  [192, 31, 196, 0, 24], // AS112
  [192, 52, 193, 0, 24], // AMT
  [192, 88, 99, 0, 24], // 6to4 relay anycast
  [192, 168, 0, 0, 16], // private
  [192, 175, 48, 0, 24], // AS112
  [198, 18, 0, 0, 15], // benchmarking
  [198, 51, 100, 0, 24], // TEST-NET-2
  [203, 0, 113, 0, 24], // TEST-NET-3
  [224, 0, 0, 0, 4], // multicast
  [240, 0, 0, 0, 4], // reserved, incl. 255.255.255.255
];

function v4ToInt(b: number[]): number {
  return ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
}

function isBlockedV4(b: number[]): boolean {
  const ip = v4ToInt(b);
  return BLOCKED_V4.some(([a, b2, c, d, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((ip & mask) >>> 0) === ((v4ToInt([a, b2, c, d]) & mask) >>> 0);
  });
}

function isBlockedV6(w: number[]): boolean {
  const zeroUpTo = (n: number) => w.slice(0, n).every((x) => x === 0);
  // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (IPv4-compatible, deprecated),
  // incl. :: and ::1: judge the embedded IPv4 address.
  if (zeroUpTo(5) && (w[5] === 0xffff || w[5] === 0)) {
    if (w[5] === 0 && w[6] === 0) return true; // ::, ::1 and ::0.0.x.x
    return isBlockedV4([w[6] >> 8, w[6] & 0xff, w[7] >> 8, w[7] & 0xff]);
  }
  // 64:ff9b::/96 NAT64 well-known prefix: judge the embedded IPv4 address.
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0)) {
    return isBlockedV4([w[6] >> 8, w[6] & 0xff, w[7] >> 8, w[7] & 0xff]);
  }
  // Only global unicast 2000::/3 is allowed at all. This blocks fc00::/7
  // (unique local), fe80::/10 (link-local), fec0::/10, ff00::/8 (multicast),
  // 64:ff9b:1::/48, 100::/64 and everything else outside 2000::/3.
  if ((w[0] & 0xe000) !== 0x2000) return true;
  if (w[0] === 0x2001 && w[1] < 0x0200) return true; // 2001::/23 IETF special (Teredo, ORCHID, ...)
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true; // 2001:db8::/32 documentation
  if (w[0] === 0x2002) return true; // 6to4: may embed any IPv4 address
  if ((w[0] & 0xfff0) === 0x3ff0) return true; // 3fff::/20 documentation
  return false;
}

/** True when an address literal must never be contacted. Unparseable input is blocked. */
export function isBlockedAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isBlockedV4(v4);
  const v6 = parseIPv6(ip);
  if (v6) return isBlockedV6(v6);
  return true;
}

// ---------------------------------------------------------------------------
// URL validation

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

// The test hook only works under the test runner (NODE_ENV === "test").
// In a production or dev server it is ignored even if app code passed it,
// so localhost can never be reached through this switch.
function testHook(deps: SafeFetchDeps): SafeFetchDeps["testOnly"] {
  return process.env.NODE_ENV === "test" ? deps.testOnly : undefined;
}

function allowedPorts(deps: SafeFetchDeps): Set<string> {
  const ports = new Set(["", "80", "443"]);
  for (const p of testHook(deps)?.extraPorts ?? []) ports.add(String(p));
  return ports;
}

function addressAllowed(ip: string, deps: SafeFetchDeps): boolean {
  if (testHook(deps)?.allowLoopback) {
    const v4 = parseIPv4(ip);
    if (v4 && v4[0] === 127 && v4[1] === 0 && v4[2] === 0 && v4[3] === 1) return true;
    if (ip === "::1") return true;
  }
  return !isBlockedAddress(ip);
}

/** Checks scheme, credentials, port and host. Returns the parsed URL. */
export function checkUrl(input: string | URL, deps: SafeFetchDeps = {}): URL {
  let url: URL;
  try {
    url = new URL(typeof input === "string" ? input.trim() : input.href);
  } catch {
    throw new PrintFetchError("bad-url", "URL cannot be parsed");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PrintFetchError("bad-scheme", `scheme ${url.protocol} is not allowed`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new PrintFetchError("bad-url", "credentials in URL are not allowed");
  }
  if (!allowedPorts(deps).has(url.port)) {
    throw new PrintFetchError("bad-url", "port is not allowed");
  }
  const host = stripBrackets(url.hostname);
  if (host === "") throw new PrintFetchError("bad-url", "URL has no host");
  if (isIP(host) !== 0) {
    if (!addressAllowed(host, deps)) throw new PrintFetchError("blocked-address", "host is a blocked address literal");
    return url;
  }
  const name = host.replace(/\.+$/, "").toLowerCase();
  if (name === "" || name === "localhost" || name.endsWith(".localhost")) {
    throw new PrintFetchError("blocked-address", "host is a local name");
  }
  return url;
}

// ---------------------------------------------------------------------------
// DNS + transport defaults

export const defaultResolver: Resolver = async (hostname) => {
  const all = await dnsLookup(hostname, { all: true, verbatim: true });
  return all.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
};

/** Resolves the URL's host and returns the address to connect to. Rejects if
 *  any resolved address is blocked. */
async function pinAddress(url: URL, deps: SafeFetchDeps, abort: Promise<never>): Promise<ResolvedAddress> {
  const host = stripBrackets(url.hostname);
  const literal = isIP(host);
  if (literal !== 0) {
    if (!addressAllowed(host, deps)) throw new PrintFetchError("blocked-address", "host is a blocked address literal");
    return { address: host, family: literal === 6 ? 6 : 4 };
  }
  const resolve = deps.resolve ?? defaultResolver;
  let addrs: ResolvedAddress[];
  try {
    addrs = await Promise.race([resolve(host), abort]);
  } catch (e) {
    if (e instanceof PrintFetchError) throw e;
    throw new PrintFetchError("network", "DNS lookup failed", { cause: e });
  }
  if (!addrs || addrs.length === 0) throw new PrintFetchError("network", "DNS lookup returned no address");
  for (const a of addrs) {
    if (isIP(a.address) === 0 || !addressAllowed(a.address, deps)) {
      throw new PrintFetchError("blocked-address", "host resolves to a blocked address");
    }
  }
  return addrs[0];
}

/** Default transport: node:http(s) with the socket pinned to `address`.
 *  Host header, SNI and certificate checks use the URL's hostname. */
export const nodeTransport: Transport = (req) =>
  new Promise<TransportResponse>((resolve, reject) => {
    const mod = req.url.protocol === "https:" ? https : http;
    const pinned = req.address;
    const lookup = ((_host: string, options: { all?: boolean } | undefined, cb: (...args: unknown[]) => void) => {
      if (options && options.all) cb(null, [{ address: pinned.address, family: pinned.family }]);
      else cb(null, pinned.address, pinned.family);
    }) as unknown as LookupFunction;
    const r = mod.request(
      {
        protocol: req.url.protocol,
        hostname: stripBrackets(req.url.hostname),
        port: req.url.port || undefined,
        path: `${req.url.pathname}${req.url.search}`,
        method: req.method,
        headers: req.headers,
        lookup,
        agent: false,
        signal: req.signal,
      },
      (res) => {
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
        }
        resolve({
          status: res.statusCode ?? 0,
          headers,
          body: res,
          cancel: () => {
            res.destroy();
            r.destroy();
          },
        });
      },
    );
    r.on("error", reject);
    r.end();
  });

// ---------------------------------------------------------------------------
// Body helpers

function decompress(body: AsyncIterable<Uint8Array>, encoding: string): { stream: AsyncIterable<Uint8Array>; destroy: () => void } {
  const enc = encoding.trim().toLowerCase();
  if (enc === "" || enc === "identity") return { stream: body, destroy: () => {} };
  let z: zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress;
  if (enc === "gzip" || enc === "x-gzip") z = zlib.createGunzip();
  else if (enc === "deflate") z = zlib.createInflate();
  else if (enc === "br") z = zlib.createBrotliDecompress();
  else throw new PrintFetchError("network", "unsupported content encoding");
  const src = Readable.from(body, { objectMode: false });
  const out = pipeline(src, z, () => {
    /* errors surface while iterating `out` */
  });
  return {
    stream: out,
    destroy: () => {
      src.destroy();
      z.destroy();
    },
  };
}

function mimeOf(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

function charsetFromContentType(contentType: string): string | null {
  const m = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return m ? m[1].toLowerCase() : null;
}

function sniffMetaCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const m1 = /<meta[^>]+charset\s*=\s*["']?\s*([a-zA-Z0-9_\-:.]+)/i.exec(head);
  return m1 ? m1[1].toLowerCase() : null;
}

/** Decodes text using (in order) a BOM, the Content-Type charset, an HTML
 *  <meta charset> / http-equiv in the first 4 KB, else UTF-8. */
export function decodeText(bytes: Uint8Array, contentType: string): string {
  let label: string | null = null;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) label = "utf-8";
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) label = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) label = "utf-16be";
  label ??= charsetFromContentType(contentType);
  if (!label) {
    const mime = mimeOf(contentType);
    if (mime === "" || mime === "text/html" || mime === "application/xhtml+xml") label = sniffMetaCharset(bytes);
  }
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(label ?? "utf-8");
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  // Node 22 decodes windows-1252 (which WHATWG also uses for "iso-8859-1" and
  // "latin1") as plain Latin-1, turning 0x80-0x9F (smart quotes, dashes, €)
  // into control characters. Decode that range by the WHATWG table instead.
  if (decoder.encoding === "windows-1252") return decodeWindows1252(bytes);
  return decoder.decode(bytes);
}

// WHATWG windows-1252 code points for bytes 0x80-0x9F.
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

function decodeWindows1252(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const codes: number[] = [];
    const end = Math.min(bytes.length, i + CHUNK);
    for (let j = i; j < end; j++) {
      const b = bytes[j];
      codes.push(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : b);
    }
    out += String.fromCharCode(...codes);
  }
  return out;
}

function isPdf(mime: string, bytes: Uint8Array): boolean {
  if (mime === "application/pdf") return true;
  return mime === "" && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

function isTextMime(mime: string): boolean {
  return mime === "" || mime.startsWith("text/") || mime === "application/xhtml+xml";
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// ---------------------------------------------------------------------------
// safeFetch

export async function safeFetch(url: string | URL, opts: SafeFetchOptions = {}, deps: SafeFetchDeps = {}): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxHtml = opts.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES;
  const maxPdf = opts.maxPdfBytes ?? DEFAULT_MAX_PDF_BYTES;
  const allowedTypes = (opts.allowedContentTypes ?? DEFAULT_ALLOWED_CONTENT_TYPES).map((t) => t.toLowerCase());
  const transport = deps.transport ?? nodeTransport;

  const headers: Record<string, string> = { ...BROWSER_HEADERS };
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    const key = k.toLowerCase();
    if (FORBIDDEN_EXTRA_HEADERS.has(key) || key.startsWith("proxy-")) continue;
    headers[key] = v;
  }

  // Validate before any timer is started (a bad URL throws right away).
  let current = checkUrl(url, deps);

  // One controller for the whole call (DNS + every hop + body).
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onOuterAbort, { once: true });
  }
  const abortError = () =>
    timedOut ? new PrintFetchError("timeout", "request timed out") : new PrintFetchError("network", "request was aborted");
  const abortPromise = new Promise<never>((_, reject) => {
    const fail = () => reject(abortError());
    if (controller.signal.aborted) fail();
    else controller.signal.addEventListener("abort", fail, { once: true });
  });
  abortPromise.catch(() => {}); // avoid unhandled rejection when unused

  let method: "GET" | "HEAD" = opts.method ?? "GET";
  const seen = new Set<string>([current.href]);
  let active: TransportResponse | null = null;

  try {
    for (let hop = 0; ; hop++) {
      const address = await pinAddress(current, deps, abortPromise);
      let res: TransportResponse;
      try {
        res = await Promise.race([transport({ url: current, address, method, headers: { ...headers }, signal: controller.signal }), abortPromise]);
      } catch (e) {
        if (e instanceof PrintFetchError) throw e;
        if (controller.signal.aborted) throw abortError();
        throw new PrintFetchError("network", "connection failed", { cause: e });
      }
      active = res;

      if (REDIRECT_STATUSES.has(res.status)) {
        res.cancel();
        active = null;
        const location = res.headers["location"];
        if (!location) throw new PrintFetchError("http-status", "redirect without location", { status: res.status });
        if (hop >= maxRedirects) throw new PrintFetchError("too-many-redirects", "too many redirects");
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          throw new PrintFetchError("bad-url", "redirect location cannot be parsed");
        }
        next.hash = "";
        next = checkUrl(next, deps); // scheme, credentials, port, host literal
        if (seen.has(next.href)) throw new PrintFetchError("too-many-redirects", "redirect loop");
        seen.add(next.href);
        if (res.status === 303 && method !== "HEAD") method = "GET";
        current = next;
        continue; // next iteration resolves + validates the new host again
      }

      if (res.status < 200 || res.status >= 300) {
        res.cancel();
        active = null;
        throw new PrintFetchError("http-status", `HTTP ${res.status}`, { status: res.status });
      }

      const contentType = res.headers["content-type"] ?? "";
      const mime = mimeOf(contentType);
      if (mime !== "" && !allowedTypes.includes(mime)) {
        res.cancel();
        active = null;
        throw new PrintFetchError("unsupported-content-type", `content type ${mime} is not allowed`);
      }

      const limit = mime === "application/pdf" ? maxPdf : maxHtml;
      const declared = Number(res.headers["content-length"]);
      if (Number.isFinite(declared) && declared > limit && method !== "HEAD") {
        res.cancel();
        active = null;
        throw new PrintFetchError("too-large", "declared size is over the limit");
      }

      let bytes: Uint8Array = new Uint8Array(0);
      if (method !== "HEAD" && res.status !== 204) {
        bytes = await readLimited(res, limit, controller.signal, abortPromise, abortError);
      }
      res.cancel();
      active = null;

      const result: SafeFetchResult = {
        finalUrl: current.href,
        status: res.status,
        contentType,
        bytes,
        truncated: false,
      };
      if (!isPdf(mime, bytes) && isTextMime(mime)) result.text = decodeText(bytes, contentType);
      return result;
    }
  } catch (e) {
    if (e instanceof PrintFetchError) throw e;
    if (controller.signal.aborted) throw abortError();
    throw new PrintFetchError("network", "request failed", { cause: e });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
    active?.cancel();
  }
}

async function readLimited(
  res: TransportResponse,
  limit: number,
  signal: AbortSignal,
  abortPromise: Promise<never>,
  abortError: () => PrintFetchError,
): Promise<Uint8Array> {
  const { stream, destroy } = decompress(res.body, res.headers["content-encoding"] ?? "");
  const it = stream[Symbol.asyncIterator]();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw abortError();
      let step: IteratorResult<Uint8Array>;
      try {
        step = await Promise.race([it.next(), abortPromise]);
      } catch (e) {
        if (e instanceof PrintFetchError) throw e;
        if (signal.aborted) throw abortError();
        throw new PrintFetchError("network", "reading the body failed", { cause: e });
      }
      if (step.done) break;
      const chunk = step.value instanceof Uint8Array ? step.value : new Uint8Array(step.value as ArrayBufferLike);
      total += chunk.byteLength;
      if (total > limit) throw new PrintFetchError("too-large", "body is over the size limit");
      chunks.push(chunk);
    }
  } catch (e) {
    destroy();
    res.cancel();
    void it.return?.().catch(() => {});
    throw e;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
