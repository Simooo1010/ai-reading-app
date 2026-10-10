import { describe, expect, it } from "vitest";
import { PrintFetchError } from "@/lib/print/errors";
import type { SafeFetchOptions, SafeFetchResult } from "@/lib/print/fetch";
import { arxivCandidates, classifyUrl, isLikelySubstack, printPlan, resolveArxiv, type FetchLike } from "@/lib/print/route";

// URLs and HTML snippets below are hand-made test fixtures.

describe("classifyUrl", () => {
  it.each([
    ["https://arxiv.org/abs/2301.12345", "arxiv-abs", "2301.12345"],
    ["https://arxiv.org/abs/2301.12345v2", "arxiv-abs", "2301.12345v2"],
    ["https://arxiv.org/abs/0704.0001", "arxiv-abs", "0704.0001"],
    ["https://www.arxiv.org/abs/2410.01234", "arxiv-abs", "2410.01234"],
    ["https://export.arxiv.org/abs/2106.09685", "arxiv-abs", "2106.09685"],
    ["https://arxiv.org/abs/hep-th/9901001", "arxiv-abs", "hep-th/9901001"],
    ["https://arxiv.org/abs/hep-th/9901001v3", "arxiv-abs", "hep-th/9901001v3"],
    ["https://arxiv.org/abs/math.GT/0309136", "arxiv-abs", "math.GT/0309136"],
    ["https://arxiv.org/abs/cond-mat/0102536", "arxiv-abs", "cond-mat/0102536"],
    ["https://arxiv.org/abs/2301.12345?context=cs.LG", "arxiv-abs", "2301.12345"],
    ["https://arxiv.org/abs/2301.12345#section", "arxiv-abs", "2301.12345"],
    ["https://ARXIV.ORG/abs/2301.12345", "arxiv-abs", "2301.12345"],
    ["https://arxiv.org/pdf/2301.12345", "arxiv-pdf", "2301.12345"],
    ["https://arxiv.org/pdf/2301.12345v1", "arxiv-pdf", "2301.12345v1"],
    ["https://arxiv.org/pdf/2301.12345.pdf", "arxiv-pdf", "2301.12345"],
    ["https://arxiv.org/pdf/2301.12345v2.PDF", "arxiv-pdf", "2301.12345v2"],
    ["https://arxiv.org/pdf/hep-th/9901001", "arxiv-pdf", "hep-th/9901001"],
    ["https://arxiv.org/pdf/hep-th/9901001v1.pdf", "arxiv-pdf", "hep-th/9901001v1"],
    ["https://arxiv.org/html/2301.12345", "arxiv-html", "2301.12345"],
    ["https://arxiv.org/html/2301.12345v2", "arxiv-html", "2301.12345v2"],
    ["https://arxiv.org/html/2301.12345v2/", "arxiv-html", "2301.12345v2"],
    ["https://arxiv.org/html/2301.12345v2/index.html#S1", "arxiv-html", "2301.12345v2"],
  ])("%s -> %s", (url, kind, id) => {
    expect(classifyUrl(url)).toEqual({ kind, arxivId: id });
  });

  it.each([
    ["https://example.com/paper.pdf", "pdf"],
    ["https://example.com/paper.PDF", "pdf"],
    ["https://example.com/files/Report.Pdf?download=1", "pdf"],
    ["https://example.com/paper.pdf#page=3", "pdf"],
    ["https://example.com/paper.pdf?x=1#y", "pdf"],
    ["https://example.com/pdf-guide", "web"],
    ["https://example.com/page?file=doc.pdf", "web"],
    ["https://example.com/doc.pdf.html", "web"],
    ["https://someone.substack.com/p/post", "web"],
    ["https://arxiv.org/list/cs.AI/recent", "web"],
    ["https://arxiv.org/abs/not-an-id", "web"],
    ["https://notarxiv.org/abs/2301.12345", "web"],
    ["https://arxiv.org.evil.example/abs/2301.12345", "web"],
    ["not a url", "web"],
  ])("%s -> %s", (url, kind) => {
    expect(classifyUrl(url)).toEqual({ kind });
  });
});

describe("arxivCandidates", () => {
  it("builds html and pdf URLs, keeping the version", () => {
    expect(arxivCandidates("2301.12345")).toEqual({
      html: "https://arxiv.org/html/2301.12345",
      pdf: "https://arxiv.org/pdf/2301.12345",
    });
    expect(arxivCandidates("2301.12345v2")).toEqual({
      html: "https://arxiv.org/html/2301.12345v2",
      pdf: "https://arxiv.org/pdf/2301.12345v2",
    });
    expect(arxivCandidates("hep-th/9901001").pdf).toBe("https://arxiv.org/pdf/hep-th/9901001");
  });
});

function ok(url: string, contentType = "text/html; charset=utf-8"): SafeFetchResult {
  return { finalUrl: url, status: 200, contentType, bytes: new Uint8Array(0), text: "", truncated: false };
}

function fetchStub(behaviour: (url: string) => SafeFetchResult | PrintFetchError) {
  const calls: { url: string; opts?: SafeFetchOptions }[] = [];
  const fetch: FetchLike = async (url, opts) => {
    calls.push({ url, opts });
    const r = behaviour(url);
    if (r instanceof PrintFetchError) throw r;
    return r;
  };
  return { fetch, calls };
}

describe("resolveArxiv", () => {
  it("HTML version exists", async () => {
    const s = fetchStub((u) => ok(u));
    expect(await resolveArxiv("2301.12345", { fetch: s.fetch })).toEqual({ kind: "html", url: "https://arxiv.org/html/2301.12345" });
    expect(s.calls[0]).toEqual({ url: "https://arxiv.org/html/2301.12345", opts: expect.objectContaining({ method: "HEAD" }) });
  });

  it("404 means no HTML version", async () => {
    const s = fetchStub(() => new PrintFetchError("http-status", "HTTP 404", { status: 404 }));
    expect(await resolveArxiv("hep-th/9901001", { fetch: s.fetch })).toEqual({
      kind: "pdf",
      url: "https://arxiv.org/pdf/hep-th/9901001",
      reason: "no-html-version",
    });
  });

  it.each([
    new PrintFetchError("timeout", "timed out"),
    new PrintFetchError("network", "down"),
    new PrintFetchError("http-status", "HTTP 503", { status: 503 }),
    new PrintFetchError("http-status", "HTTP 403", { status: 403 }),
  ])("errors fall back to the PDF with check-failed (%s)", async (err) => {
    const s = fetchStub(() => err);
    expect(await resolveArxiv("2301.12345v2", { fetch: s.fetch })).toEqual({
      kind: "pdf",
      url: "https://arxiv.org/pdf/2301.12345v2",
      reason: "check-failed",
    });
  });

  it("200 but not HTML is check-failed", async () => {
    const s = fetchStub((u) => ok(u, "application/pdf"));
    expect(await resolveArxiv("2301.12345", { fetch: s.fetch })).toMatchObject({ kind: "pdf", reason: "check-failed" });
  });

  it("a non-PrintFetchError is check-failed too", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("boom");
    };
    expect(await resolveArxiv("2301.12345", { fetch })).toMatchObject({ kind: "pdf", reason: "check-failed" });
  });
});

describe("printPlan", () => {
  const never = fetchStub(() => {
    throw new Error("should not fetch");
  });

  it("direct PDF -> open-pdf without any fetch", async () => {
    expect(await printPlan("https://example.com/paper.PDF?dl=1", { fetch: never.fetch })).toEqual({
      action: "open-pdf",
      url: "https://example.com/paper.PDF?dl=1",
      reason: "direct-pdf",
    });
  });

  it("arXiv PDF link -> open-pdf", async () => {
    expect(await printPlan("https://arxiv.org/pdf/2301.12345v2.pdf", { fetch: never.fetch })).toEqual({
      action: "open-pdf",
      url: "https://arxiv.org/pdf/2301.12345v2.pdf",
      reason: "arxiv-pdf-link",
      arxivId: "2301.12345v2",
    });
  });

  it("arXiv HTML link -> extract arxiv-html", async () => {
    expect(await printPlan("https://arxiv.org/html/2301.12345v2", { fetch: never.fetch })).toEqual({
      action: "extract",
      url: "https://arxiv.org/html/2301.12345v2",
      source: "arxiv-html",
      arxivId: "2301.12345v2",
    });
  });

  it("arXiv abstract with HTML version -> extract the HTML version, never the abstract page", async () => {
    const s = fetchStub((u) => ok(u));
    const plan = await printPlan("https://arxiv.org/abs/2301.12345", { fetch: s.fetch });
    expect(plan).toEqual({ action: "extract", url: "https://arxiv.org/html/2301.12345", source: "arxiv-html", arxivId: "2301.12345" });
  });

  it("arXiv abstract without HTML version -> open the PDF", async () => {
    const s = fetchStub(() => new PrintFetchError("http-status", "HTTP 404", { status: 404 }));
    expect(await printPlan("https://export.arxiv.org/abs/hep-th/9901001", { fetch: s.fetch })).toEqual({
      action: "open-pdf",
      url: "https://arxiv.org/pdf/hep-th/9901001",
      reason: "no-html-version",
      arxivId: "hep-th/9901001",
    });
  });

  it("arXiv abstract when the check fails -> open the PDF with check-failed", async () => {
    const s = fetchStub(() => new PrintFetchError("timeout", "timed out"));
    expect(await printPlan("https://arxiv.org/abs/2301.12345", { fetch: s.fetch })).toMatchObject({
      action: "open-pdf",
      reason: "check-failed",
    });
  });

  it("everything else -> extract web", async () => {
    for (const url of ["https://someone.substack.com/p/post", "https://www.example.org/essay", "https://arxiv.org/list/cs.AI/recent"]) {
      expect(await printPlan(url, { fetch: never.fetch })).toEqual({ action: "extract", url, source: "web" });
    }
  });

  it("no plan ever extracts an arXiv abstract page", async () => {
    const urls = ["https://arxiv.org/abs/2301.12345", "https://www.arxiv.org/abs/hep-th/9901001v2"];
    for (const behave of [(u: string) => ok(u), () => new PrintFetchError("network", "x")]) {
      for (const url of urls) {
        const plan = await printPlan(url, { fetch: fetchStub(behave).fetch });
        expect(plan.url).not.toMatch(/\/abs\//);
      }
    }
  });
});

describe("isLikelySubstack", () => {
  it("host on substack.com is enough", () => {
    expect(isLikelySubstack("<html></html>", "https://someone.substack.com/p/x")).toEqual({ substack: true, reasons: ["host"] });
  });

  it("custom domain with Substack markers", () => {
    const html = `<html><head>
      <meta property="og:site_name" content="A Newsletter">
      <meta name="generator" content="Substack">
      <link rel="preconnect" href="https://substackcdn.com">
      <script src="https://substackcdn.com/bundle/main.js"></script>
      <script>window._preloads = JSON.parse("{}")</script>
    </head><body><div class="available-content"><div class="body markup"><p>Hi</p></div></div></body></html>`;
    const r = isLikelySubstack(html, "https://www.newsletter.example/p/post");
    expect(r.substack).toBe(true);
    expect(r.reasons).toEqual(
      expect.arrayContaining(["meta-generator", "substackcdn", "script", "window._preloads", "class:available-content", "class:body-markup"]),
    );
    expect(r.reasons).not.toContain("host");
  });

  it("two weak markers are enough", () => {
    const html = `<div class="available-content"><div class="body markup"><p>x</p></div></div>`;
    expect(isLikelySubstack(html, "https://blog.example/p/x").substack).toBe(true);
  });

  it("a normal blog with one embedded Substack image is not Substack", () => {
    const html = `<article><p>See this chart</p><img src="https://substackcdn.com/image/fetch/x.png"></article>`;
    expect(isLikelySubstack(html, "https://blog.example/post")).toEqual({ substack: false, reasons: ["substackcdn"] });
  });

  it("plain page", () => {
    expect(isLikelySubstack("<html><body><p>Hello</p></body></html>", "https://example.com/")).toEqual({
      substack: false,
      reasons: [],
    });
  });

  it("host lookalikes do not count", () => {
    expect(isLikelySubstack("<p></p>", "https://substack.com.evil.example/").reasons).not.toContain("host");
    expect(isLikelySubstack("<p></p>", "https://notsubstack.com/").reasons).not.toContain("host");
  });
});
