import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPrintCache } from "@/lib/print/cache";
import { PrintFetchError } from "@/lib/print/errors";
import type { ExtractOptions } from "@/lib/print/extract";
import type { SafeFetchOptions, SafeFetchResult } from "@/lib/print/fetch";
import { isCacheableLoad, LOAD_MESSAGES, loadPrintable, OPEN_PDF_MESSAGES, validLink, type LoadDeps, type PrintItemInput } from "@/lib/print/load";
import { printPlan, type FetchLike } from "@/lib/print/route";
import type { FidelityCheck, PrintResult, PrintStatus } from "@/lib/print/types";

// No network: every fetch is a stub. URLs and items are test fixtures.

const CHECK: FidelityCheck = {
  wordsFound: 1000,
  wordsPrinted: 1000,
  placeholderWords: 0,
  imagesFound: 0,
  imagesKept: 0,
  tablesFound: 0,
  tablesKept: 0,
  codeFound: 0,
  codeKept: 0,
  embedsFound: 0,
  embedsPlaceholdered: 0,
  widgetsRemoved: 0,
  widgetWords: 0,
  skippedUnsupported: 0,
  wordsHidden: 0,
  wordsPage: 1000,
  coverage: 1,
  ratio: 1,
  withinTolerance: true,
  details: [],
};

function result(status: PrintStatus): PrintResult {
  return { status, message: `fixture ${status}`, source: "web", check: CHECK, warnings: [] };
}

function item(link: string, readingTimeMin: number | null = 20): PrintItemInput {
  return { id: "00000000-0000-0000-0000-000000000001", title: "Fixture", author: "Fixture Author", link, readingTimeMin };
}

function page(url: string, text = "<html><body><p>fixture</p></body></html>", extra: Partial<SafeFetchResult> = {}): SafeFetchResult {
  return { finalUrl: url, status: 200, contentType: "text/html; charset=utf-8", bytes: new Uint8Array(0), text, truncated: false, ...extra };
}

type Behaviour = (url: string) => SafeFetchResult | Error;

/** deps with a stub page fetch, a stub HEAD fetch for arXiv, a fresh cache and a spy extractor. */
function setup(opts: { page?: Behaviour; head?: Behaviour; status?: PrintStatus; realExtract?: boolean } = {}) {
  const pageCalls: string[] = [];
  const headCalls: { url: string; opts?: SafeFetchOptions }[] = [];
  const logs: string[] = [];
  const extractCalls: { html: string; url: string; opts: ExtractOptions }[] = [];
  const head: FetchLike = async (url, o) => {
    headCalls.push({ url, opts: o });
    const r = (opts.head ?? ((u) => page(u, "")))(url);
    if (r instanceof Error) throw r;
    return r;
  };
  const deps: LoadDeps = {
    fetch: async (url) => {
      pageCalls.push(url);
      const r = (opts.page ?? ((u) => page(u)))(url);
      if (r instanceof Error) throw r;
      return r;
    },
    plan: (u) => printPlan(u, { fetch: head }),
    cache: createPrintCache({ isCacheable: isCacheableLoad }),
    log: (m) => logs.push(m),
  };
  if (!opts.realExtract) {
    deps.extract = (html, url, o) => {
      extractCalls.push({ html, url, opts: o });
      return result(opts.status ?? "ok");
    };
  }
  return { deps, pageCalls, headCalls, logs, extractCalls };
}

describe("validLink", () => {
  it.each([
    ["https://example.com/a", "https://example.com/a"],
    ["  http://example.com/a  ", "http://example.com/a"],
    ["", null],
    ["   ", null],
    ["ftp://example.com/a", null],
    ["javascript:alert(1)", null],
    ["file:///etc/passwd", null],
    ["https://user:pw@example.com/", null],
    ["not a url", null],
  ])("%j -> %j", (input, out) => {
    expect(validLink(input)).toBe(out);
  });
  it("non-strings are rejected", () => {
    expect(validLink(undefined)).toBeNull();
    expect(validLink(42)).toBeNull();
  });
});

describe("loadPrintable: open-pdf branches (no page download)", () => {
  it("direct PDF link", async () => {
    const s = setup();
    const r = await loadPrintable(item("https://example.com/report.pdf"), s.deps);
    expect(r).toEqual({ kind: "open-pdf", url: "https://example.com/report.pdf", reason: "direct-pdf", message: OPEN_PDF_MESSAGES["direct-pdf"] });
    expect(s.pageCalls).toEqual([]);
    expect(s.headCalls).toEqual([]);
  });

  it("arXiv /pdf/ link", async () => {
    const s = setup();
    const r = await loadPrintable(item("https://arxiv.org/pdf/2301.12345"), s.deps);
    expect(r).toMatchObject({ kind: "open-pdf", url: "https://arxiv.org/pdf/2301.12345", reason: "arxiv-pdf-link" });
    expect(s.pageCalls).toEqual([]);
  });

  it("arXiv abstract without an HTML version -> open the PDF", async () => {
    const s = setup({ head: () => new PrintFetchError("http-status", "HTTP 404", { status: 404 }) });
    const r = await loadPrintable(item("https://arxiv.org/abs/1706.03762"), s.deps);
    expect(r).toEqual({
      kind: "open-pdf",
      url: "https://arxiv.org/pdf/1706.03762",
      reason: "no-html-version",
      message: "This paper has no web version we can print. The PDF is ready to print.",
    });
    expect(s.headCalls.map((c) => c.url)).toEqual(["https://arxiv.org/html/1706.03762"]);
    expect(s.pageCalls).toEqual([]);
  });

  it("arXiv check failed -> open the PDF with its own message", async () => {
    const s = setup({ head: () => new PrintFetchError("timeout", "timed out") });
    const r = await loadPrintable(item("https://arxiv.org/abs/2301.12345"), s.deps);
    expect(r).toMatchObject({ kind: "open-pdf", reason: "check-failed", message: OPEN_PDF_MESSAGES["check-failed"] });
  });

  it("arXiv check: 'no HTML version' is cached (one HEAD), 'check failed' is not", async () => {
    const s = setup({ head: () => new PrintFetchError("http-status", "HTTP 404", { status: 404 }) });
    await loadPrintable(item("https://arxiv.org/abs/1706.03762"), s.deps);
    await loadPrintable(item("https://arxiv.org/abs/1706.03762"), s.deps);
    expect(s.headCalls).toHaveLength(1);
    const f = setup({ head: () => new PrintFetchError("network", "down") });
    await loadPrintable(item("https://arxiv.org/abs/1706.03762"), f.deps);
    await loadPrintable(item("https://arxiv.org/abs/1706.03762"), f.deps);
    expect(f.headCalls).toHaveLength(2);
  });

  it("arXiv with HTML: second load makes no HEAD and no page fetch", async () => {
    const s = setup();
    await loadPrintable(item("https://arxiv.org/abs/2402.12345"), s.deps);
    await loadPrintable(item("https://arxiv.org/abs/2402.12345"), s.deps);
    expect(s.headCalls).toHaveLength(1);
    expect(s.pageCalls).toHaveLength(1);
  });

  it("a web link that answers with a PDF -> open-pdf at the final URL", async () => {
    const s = setup({ page: (u) => page(u + "/file", undefined, { contentType: "application/pdf", text: undefined }) });
    const r = await loadPrintable(item("https://example.com/download"), s.deps);
    expect(r).toMatchObject({ kind: "open-pdf", url: "https://example.com/download/file", reason: "direct-pdf" });
    expect(s.extractCalls).toEqual([]);
  });
});

describe("loadPrintable: documents", () => {
  it("arXiv abstract WITH an HTML version: fetches /html/, extract gets the final URL without trailing slash", async () => {
    const s = setup({ page: (u) => page(`${u}v1/`) });
    const r = await loadPrintable(item("https://arxiv.org/abs/2402.12345", 45), s.deps);
    expect(r).toEqual({ kind: "document", result: result("ok") });
    expect(s.pageCalls).toEqual(["https://arxiv.org/html/2402.12345"]);
    expect(s.extractCalls).toHaveLength(1);
    expect(s.extractCalls[0].url).toBe("https://arxiv.org/html/2402.12345v1");
    expect(s.extractCalls[0].opts).toEqual({ httpStatus: 200, source: "arxiv-html", expectedMinutes: 45 });
  });

  it("web page: only the item's link is fetched; readingTimeMin goes in as expectedMinutes", async () => {
    const s = setup({ page: (u) => page(u + "/") });
    const r = await loadPrintable(item("https://blog.example.com/post", 30), s.deps);
    expect(r.kind).toBe("document");
    expect(s.pageCalls).toEqual(["https://blog.example.com/post"]);
    expect(s.headCalls).toEqual([]);
    // Non-arXiv final URLs are passed on unchanged.
    expect(s.extractCalls[0]).toMatchObject({ url: "https://blog.example.com/post/", opts: { httpStatus: 200, expectedMinutes: 30 } });
    expect(s.extractCalls[0].opts.source).toBeUndefined();
  });

  it("no reading time -> expectedMinutes undefined", async () => {
    const s = setup();
    await loadPrintable(item("https://example.com/x", null), s.deps);
    expect(s.extractCalls[0].opts.expectedMinutes).toBeUndefined();
  });

  it.each<PrintStatus>(["ok", "warning", "paywalled", "too-short"])("status %s is returned and cached", async (status) => {
    const s = setup({ status });
    const a = await loadPrintable(item("https://example.com/p"), s.deps);
    const b = await loadPrintable(item("https://example.com/p"), s.deps);
    expect(a).toEqual({ kind: "document", result: result(status) });
    expect(b).toEqual(a);
    expect(s.pageCalls).toHaveLength(1); // second load is a cache hit
  });

  it.each<PrintStatus>(["blocked", "failed"])("status %s is returned but NOT cached", async (status) => {
    const s = setup({ status });
    const a = await loadPrintable(item("https://example.com/p"), s.deps);
    await loadPrintable(item("https://example.com/p"), s.deps);
    expect(a).toEqual({ kind: "document", result: result(status) });
    expect(s.pageCalls).toHaveLength(2);
  });

  it("cache key ignores the #fragment", async () => {
    const s = setup();
    await loadPrintable(item("https://example.com/p#a"), s.deps);
    await loadPrintable(item("https://example.com/p#b"), s.deps);
    expect(s.pageCalls).toHaveLength(1);
  });

  it("real extractor on a saved Substack page (fixture) gives a printable document", async () => {
    const html = readFileSync(resolve(__dirname, "fixtures/print/81-titotal.substack.com.html"), "utf8");
    const s = setup({ realExtract: true, page: (u) => page(u, html) });
    const r = await loadPrintable(item("https://titotal.substack.com/p/fixture", 20), s.deps);
    expect(r.kind).toBe("document");
    if (r.kind === "document") {
      expect(["ok", "warning"]).toContain(r.result.status);
      expect(r.result.document?.elements.length).toBeGreaterThan(0);
      // JSON-safe: survives a round trip unchanged.
      expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    }
  });
});

describe("loadPrintable: errors", () => {
  const cases: [string, PrintFetchError, string, string][] = [
    ["401", new PrintFetchError("http-status", "HTTP 401", { status: 401 }), "http-401", "This page needs a login. Open the source instead."],
    ["402", new PrintFetchError("http-status", "HTTP 402", { status: 402 }), "http-402", "This page is behind a paywall. Open the source instead."],
    ["403", new PrintFetchError("http-status", "HTTP 403", { status: 403 }), "http-403", "The website does not allow us to read this page. Open the source instead."],
    ["404", new PrintFetchError("http-status", "HTTP 404", { status: 404 }), "http-404", "This page no longer exists."],
    ["429", new PrintFetchError("http-status", "HTTP 429", { status: 429 }), "http-429", "The website is busy. Please try again later."],
    ["timeout", new PrintFetchError("timeout", "timed out"), "timeout", "The page took too long to load. Please try again later."],
    ["blocked address", new PrintFetchError("blocked-address", "10.0.0.1 is private"), "blocked-address", "This link points to an address the app is not allowed to open."],
    ["too large", new PrintFetchError("too-large", "big"), "too-large", "This page is too big to print here. Open the source instead."],
  ];

  it.each(cases)("%s -> B1 message, Open source link, not cached", async (_name, err, code, message) => {
    const s = setup({ page: () => err });
    const r = await loadPrintable(item("https://example.com/p"), s.deps);
    expect(r).toEqual({ kind: "error", message, openUrl: "https://example.com/p", code });
    // No internals (like the IP in the server message) reach the user.
    expect(JSON.stringify(r)).not.toContain("10.0.0.1");
    await loadPrintable(item("https://example.com/p"), s.deps);
    expect(s.pageCalls).toHaveLength(2); // failure was not cached
    expect(s.logs.length).toBeGreaterThan(0);
  });

  it("a failure is retried and a later success is cached", async () => {
    let n = 0;
    const s = setup({ page: (u) => (++n === 1 ? new PrintFetchError("network", "down") : page(u)) });
    expect((await loadPrintable(item("https://example.com/p"), s.deps)).kind).toBe("error");
    expect((await loadPrintable(item("https://example.com/p"), s.deps)).kind).toBe("document");
    expect((await loadPrintable(item("https://example.com/p"), s.deps)).kind).toBe("document");
    expect(s.pageCalls).toHaveLength(2);
  });

  it.each(["", "   ", "ftp://example.com/x", "javascript:alert(1)", "notaurl"])("bad link %j -> error, nothing fetched", async (link) => {
    const s = setup();
    const r = await loadPrintable(item(link), s.deps);
    expect(r).toMatchObject({ kind: "error", message: LOAD_MESSAGES.noLink, code: "bad-url", openUrl: "" });
    expect(s.pageCalls).toEqual([]);
    expect(s.headCalls).toEqual([]);
  });

  it("an unexpected error never throws: generic message, logged without the page", async () => {
    const s = setup({ page: () => new TypeError("boom secret-ish detail") });
    const r = await loadPrintable(item("https://example.com/p"), s.deps);
    expect(r).toEqual({ kind: "error", message: LOAD_MESSAGES.unexpected, openUrl: "https://example.com/p", code: "unexpected" });
    expect(s.logs.join("\n")).toContain("example.com");
  });

  it("a throwing extractor or planner never throws either", async () => {
    const s = setup();
    s.deps.extract = () => {
      throw new Error("bad");
    };
    expect((await loadPrintable(item("https://example.com/p"), s.deps)).kind).toBe("error");
    s.deps.plan = async () => {
      throw new Error("bad plan");
    };
    expect((await loadPrintable(item("https://example.com/q"), s.deps)).kind).toBe("error");
  });

  it("a response without text (odd content) is an error, not a crash", async () => {
    const s = setup({ page: (u) => page(u, undefined, { text: undefined, contentType: "text/html" }) });
    const r = await loadPrintable(item("https://example.com/p"), s.deps);
    expect(r).toMatchObject({ kind: "error", code: "not-text", openUrl: "https://example.com/p" });
  });

  it("the default logger is console.error (server log)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = setup({ page: () => new PrintFetchError("timeout", "t") });
    delete s.deps.log;
    await loadPrintable(item("https://example.com/p"), s.deps);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
