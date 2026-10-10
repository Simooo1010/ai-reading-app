import http from "node:http";
import type { AddressInfo } from "node:net";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrintFetchError } from "@/lib/print/errors";
import {
  checkUrl,
  decodeText,
  isBlockedAddress,
  parseIPv6,
  safeFetch,
  type ResolvedAddress,
  type SafeFetchDeps,
  type Transport,
  type TransportRequest,
} from "@/lib/print/fetch";

// All network in this file is fake (injected resolver/transport) or an
// in-process server on 127.0.0.1. Hostnames below are test fixtures.

const PUBLIC: ResolvedAddress = { address: "93.184.216.34", family: 4 };

function resolverFrom(map: Record<string, ResolvedAddress[]>) {
  return async (host: string) => {
    const r = map[host];
    if (!r) throw new Error(`ENOTFOUND ${host}`);
    return r;
  };
}

async function* chunks(...parts: (string | Uint8Array)[]) {
  for (const p of parts) yield typeof p === "string" ? new TextEncoder().encode(p) : p;
}

interface FakeReply {
  status?: number;
  headers?: Record<string, string>;
  body?: AsyncIterable<Uint8Array>;
}

function fakeTransport(handler: (req: TransportRequest) => FakeReply | Promise<FakeReply>) {
  const calls: TransportRequest[] = [];
  let cancelled = 0;
  const transport: Transport = async (req) => {
    calls.push(req);
    const r = await handler(req);
    return {
      status: r.status ?? 200,
      headers: r.headers ?? { "content-type": "text/html; charset=utf-8" },
      body: r.body ?? chunks(),
      cancel: () => {
        cancelled++;
      },
    };
  };
  return { transport, calls, cancelled: () => cancelled };
}

function deps(transport: Transport, map: Record<string, ResolvedAddress[]> = { "example.com": [PUBLIC] }): SafeFetchDeps {
  return { resolve: resolverFrom(map), transport };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof PrintFetchError) return e.code;
    throw e;
  }
  return "no-error";
}

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "169.254.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "239.255.255.250",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "0:0:0:0:0:ffff:7f00:1",
    "::127.0.0.1",
    "64:ff9b::7f00:1",
    "64:ff9b::10.1.1.1",
    "64:ff9b:1::1",
    "100::1",
    "fc00::1",
    "fd12:3456:789a::1",
    "fe80::1",
    "fe80::1%eth0",
    "febf::1",
    "fec0::1",
    "ff02::1",
    "ff05::1:3",
    "2001::1",
    "2001:db8::1",
    "2002:7f00:1::1",
    "3fff::1",
    "::ffff:0:7f00:1",
    "not-an-ip",
    "",
    "1.2.3",
    "256.1.1.1",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "100.63.255.255",
    "100.128.0.0",
    "172.15.255.255",
    "172.32.0.0",
    "192.169.0.1",
    "169.255.0.1",
    "223.255.255.255",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "2a00:1450:4001:80b::200e",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
  ])("allows public %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it("parses IPv6 forms", () => {
    expect(parseIPv6("::ffff:127.0.0.1")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIPv6("[::1]")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("1:2:3:4:5:6:7:8")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parseIPv6("1::2:3:4:5:6:7:8")).toBeNull();
    expect(parseIPv6("1:2:3:4:5:6:7")).toBeNull();
    expect(parseIPv6("1::2::3")).toBeNull();
    expect(parseIPv6("12345::")).toBeNull();
  });
});

describe("checkUrl", () => {
  it.each([
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0x7f.1/",
    "http://0177.0.0.1/",
    "http://127.1/",
    "http://0/",
    "http://0.0.0.0/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:a9fe:a9fe]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
    "http://10.0.0.1/",
    "http://192.168.0.1/",
    "http://100.100.100.100/",
    "http://localhost/",
    "http://localhost./",
    "http://LOCALHOST/",
    "http://api.localhost/",
    "http://ｌｏｃａｌｈｏｓｔ/",
    "http://①②⑦.0.0.1/",
  ])("blocks %s", (u) => {
    expect(() => checkUrl(u)).toThrowError(expect.objectContaining({ code: "blocked-address" }));
  });

  it.each(["ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "gopher://example.com/"])(
    "rejects scheme %s",
    (u) => {
      expect(() => checkUrl(u)).toThrowError(expect.objectContaining({ code: "bad-scheme" }));
    },
  );

  it.each([
    "http://user:pass@example.com/",
    "http://good.com@evil.com/",
    "https://:secret@example.com/",
    "http://example.com:8080/",
    "https://example.com:8443/",
    "http://example.com:22/",
    "not a url",
    "",
  ])("rejects %s as bad-url", (u) => {
    expect(() => checkUrl(u)).toThrowError(expect.objectContaining({ code: "bad-url" }));
  });

  it("accepts normal http(s) URLs incl. explicit default ports and punycode", () => {
    expect(checkUrl("https://example.com/a?b=1").href).toBe("https://example.com/a?b=1");
    expect(checkUrl("https://example.com:443/").href).toBe("https://example.com/");
    expect(checkUrl("http://example.com:80/").href).toBe("http://example.com/");
    expect(checkUrl("http://example.com:443/").port).toBe("443");
    expect(checkUrl("https://bücher.example/").hostname).toBe("xn--bcher-kva.example");
    expect(checkUrl("https://8.8.8.8/").hostname).toBe("8.8.8.8");
  });
});

describe("safeFetch — DNS checks and pinning", () => {
  it("default deps reject 127.0.0.1 and localhost without any network", async () => {
    expect(await codeOf(safeFetch("http://127.0.0.1/"))).toBe("blocked-address");
    expect(await codeOf(safeFetch("http://localhost/"))).toBe("blocked-address");
    expect(await codeOf(safeFetch("http://[::1]/"))).toBe("blocked-address");
  });

  it("rejects when DNS returns a public AND a private address", async () => {
    const t = fakeTransport(() => ({ body: chunks("<p>hi</p>") }));
    const d = deps(t.transport, { "example.com": [PUBLIC, { address: "10.0.0.7", family: 4 }] });
    expect(await codeOf(safeFetch("https://example.com/", {}, d))).toBe("blocked-address");
    expect(t.calls).toHaveLength(0);
  });

  it("rejects IPv6 private and IPv4-mapped answers from DNS", async () => {
    for (const bad of [
      { address: "::1", family: 6 as const },
      { address: "::ffff:127.0.0.1", family: 6 as const },
      { address: "fd00::5", family: 6 as const },
      { address: "169.254.169.254", family: 4 as const },
      { address: "garbage", family: 4 as const },
    ]) {
      const t = fakeTransport(() => ({}));
      const d = deps(t.transport, { "example.com": [bad] });
      expect(await codeOf(safeFetch("https://example.com/", {}, d))).toBe("blocked-address");
      expect(t.calls).toHaveLength(0);
    }
  });

  it("DNS failure and empty answer are network errors", async () => {
    const t = fakeTransport(() => ({}));
    expect(await codeOf(safeFetch("https://unknown.example/", {}, deps(t.transport)))).toBe("network");
    expect(await codeOf(safeFetch("https://example.com/", {}, deps(t.transport, { "example.com": [] })))).toBe("network");
  });

  it("connects to the validated address and keeps the hostname in the URL", async () => {
    const t = fakeTransport(() => ({ body: chunks("<p>ok</p>") }));
    const r = await safeFetch("https://example.com/post?id=1#frag", {}, deps(t.transport));
    expect(r.status).toBe(200);
    expect(r.text).toBe("<p>ok</p>");
    expect(r.truncated).toBe(false);
    expect(t.calls[0].address).toEqual(PUBLIC);
    expect(t.calls[0].url.hostname).toBe("example.com");
    expect(t.calls[0].headers["user-agent"]).toMatch(/Mozilla\/5\.0/);
    expect(t.calls[0].headers["accept"]).toMatch(/text\/html/);
  });

  it("ignores Host / Cookie / Authorization in extra headers but keeps Range", async () => {
    const t = fakeTransport(() => ({}));
    await safeFetch(
      "https://example.com/",
      { headers: { Host: "internal", Cookie: "a=b", Authorization: "x", "Proxy-Authorization": "y", Range: "bytes=0-0" } },
      deps(t.transport),
    );
    const h = t.calls[0].headers;
    expect(h["host"]).toBeUndefined();
    expect(h["cookie"]).toBeUndefined();
    expect(h["authorization"]).toBeUndefined();
    expect(h["proxy-authorization"]).toBeUndefined();
    expect(h["range"]).toBe("bytes=0-0");
  });

  it("error messages for users contain no addresses", async () => {
    try {
      await safeFetch("http://169.254.169.254/");
      throw new Error("should fail");
    } catch (e) {
      expect(e).toBeInstanceOf(PrintFetchError);
      const err = e as PrintFetchError;
      expect(err.userMessage).not.toMatch(/\d+\.\d+/);
      expect(err.message).not.toMatch(/169\.254/);
    }
  });
});

describe("safeFetch — redirects", () => {
  const map = {
    "example.com": [PUBLIC],
    "other.example": [{ address: "93.184.216.35", family: 4 as const }],
    "evil.example": [{ address: "192.168.1.10", family: 4 as const }],
  };

  it("follows redirects and validates every hop", async () => {
    const t = fakeTransport((req) => {
      if (req.url.pathname === "/a") return { status: 301, headers: { location: "https://other.example/b" } };
      return { body: chunks("final") };
    });
    const r = await safeFetch("https://example.com/a", {}, deps(t.transport, map));
    expect(r.finalUrl).toBe("https://other.example/b");
    expect(t.calls.map((c) => c.address.address)).toEqual(["93.184.216.34", "93.184.216.35"]);
  });

  it("refuses a redirect from a public host to a private IP literal", async () => {
    const t = fakeTransport(() => ({ status: 302, headers: { location: "http://10.0.0.5/admin" } }));
    expect(await codeOf(safeFetch("https://example.com/", {}, deps(t.transport, map)))).toBe("blocked-address");
    expect(t.calls).toHaveLength(1);
  });

  it("refuses a redirect to a host that resolves to a private IP", async () => {
    const t = fakeTransport(() => ({ status: 307, headers: { location: "https://evil.example/" } }));
    expect(await codeOf(safeFetch("https://example.com/", {}, deps(t.transport, map)))).toBe("blocked-address");
    expect(t.calls).toHaveLength(1);
  });

  it.each([
    ["http://[::ffff:127.0.0.1]/", "blocked-address"],
    ["http://2130706433/", "blocked-address"],
    ["http://localhost./", "blocked-address"],
    ["file:///etc/passwd", "bad-scheme"],
    ["javascript:alert(1)", "bad-scheme"],
    ["ftp://example.com/", "bad-scheme"],
    ["http://user:pw@example.com/", "bad-url"],
    ["http://example.com:8080/", "bad-url"],
  ])("refuses redirect to %s", async (location, code) => {
    const t = fakeTransport(() => ({ status: 301, headers: { location } }));
    expect(await codeOf(safeFetch("https://example.com/", {}, deps(t.transport, map)))).toBe(code);
    expect(t.calls).toHaveLength(1);
  });

  it("detects a redirect loop", async () => {
    const t = fakeTransport((req) => ({
      status: 302,
      headers: { location: req.url.pathname === "/a" ? "/b" : "/a" },
    }));
    expect(await codeOf(safeFetch("https://example.com/a", {}, deps(t.transport, map)))).toBe("too-many-redirects");
    expect(t.calls.length).toBeLessThanOrEqual(3);
  });

  it("allows 5 redirects and refuses the 6th", async () => {
    const chain = (n: number) =>
      fakeTransport((req) => {
        const i = Number(req.url.pathname.slice(1));
        return i < n ? { status: 302, headers: { location: `/${i + 1}` } } : { body: chunks("end") };
      });
    const five = chain(5);
    const r = await safeFetch("https://example.com/0", {}, deps(five.transport, map));
    expect(r.finalUrl).toBe("https://example.com/5");
    expect(five.calls).toHaveLength(6);

    const six = chain(6);
    expect(await codeOf(safeFetch("https://example.com/0", {}, deps(six.transport, map)))).toBe("too-many-redirects");
    expect(six.calls).toHaveLength(6);
  });

  it("a redirect without Location is an http-status error", async () => {
    const t = fakeTransport(() => ({ status: 302, headers: {} }));
    expect(await codeOf(safeFetch("https://example.com/", {}, deps(t.transport, map)))).toBe("http-status");
  });
});

describe("safeFetch — timeout and size", () => {
  it("times out when the server never answers", async () => {
    const t = fakeTransport(() => new Promise<FakeReply>(() => {}));
    const start = Date.now();
    expect(await codeOf(safeFetch("https://example.com/", { timeoutMs: 50 }, deps(t.transport)))).toBe("timeout");
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("times out when DNS never answers", async () => {
    const d: SafeFetchDeps = { resolve: () => new Promise(() => {}), transport: fakeTransport(() => ({})).transport };
    expect(await codeOf(safeFetch("https://example.com/", { timeoutMs: 50 }, d))).toBe("timeout");
  });

  it("times out when the body stalls", async () => {
    async function* stall() {
      yield new TextEncoder().encode("<p>start");
      await new Promise(() => {});
    }
    const t = fakeTransport(() => ({ body: stall() }));
    expect(await codeOf(safeFetch("https://example.com/", { timeoutMs: 50 }, deps(t.transport)))).toBe("timeout");
    expect(t.cancelled()).toBeGreaterThan(0);
  });

  it("an outside abort signal stops the request", async () => {
    const t = fakeTransport(() => new Promise<FakeReply>(() => {}));
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 20);
    expect(await codeOf(safeFetch("https://example.com/", { signal: ac.signal }, deps(t.transport)))).toBe("network");
  });

  it("enforces the size limit while streaming (endless body)", async () => {
    let pulled = 0;
    async function* endless() {
      const block = new Uint8Array(64 * 1024).fill(97);
      for (;;) {
        pulled++;
        yield block;
      }
    }
    const t = fakeTransport(() => ({ body: endless() }));
    expect(await codeOf(safeFetch("https://example.com/", { maxHtmlBytes: 1024 * 1024 }, deps(t.transport)))).toBe("too-large");
    expect(pulled).toBeLessThanOrEqual(17);
    expect(t.cancelled()).toBeGreaterThan(0);
  });

  it("rejects a declared Content-Length over the limit before reading", async () => {
    let pulled = 0;
    async function* body() {
      pulled++;
      yield new Uint8Array(10);
    }
    const t = fakeTransport(() => ({ headers: { "content-type": "text/html", "content-length": "999999999" }, body: body() }));
    expect(await codeOf(safeFetch("https://example.com/", {}, deps(t.transport)))).toBe("too-large");
    expect(pulled).toBe(0);
  });

  it("uses the PDF limit for PDFs and the HTML limit for HTML", async () => {
    const big = new Uint8Array(2048).fill(0x41);
    const pdf = fakeTransport(() => ({ headers: { "content-type": "application/pdf" }, body: chunks("%PDF-1.7\n", big) }));
    const r = await safeFetch("https://example.com/x.pdf", { maxHtmlBytes: 1000, maxPdfBytes: 5000 }, deps(pdf.transport));
    expect(r.bytes.byteLength).toBe(9 + 2048);
    expect(r.text).toBeUndefined();

    const html = fakeTransport(() => ({ headers: { "content-type": "text/html" }, body: chunks(big) }));
    expect(await codeOf(safeFetch("https://example.com/", { maxHtmlBytes: 1000, maxPdfBytes: 5000 }, deps(html.transport)))).toBe(
      "too-large",
    );
  });

  it("decompresses gzip and br", async () => {
    const page = "<html><body><p>Gzip café</p></body></html>";
    const gz = fakeTransport(() => ({
      headers: { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip" },
      body: chunks(gzipSync(Buffer.from(page))),
    }));
    expect((await safeFetch("https://example.com/", {}, deps(gz.transport))).text).toBe(page);

    const br = fakeTransport(() => ({
      headers: { "content-type": "text/html; charset=utf-8", "content-encoding": "br" },
      body: chunks(brotliCompressSync(Buffer.from(page))),
    }));
    expect((await safeFetch("https://example.com/", {}, deps(br.transport))).text).toBe(page);
  });

  it("limits the decompressed size (gzip bomb)", async () => {
    const bomb = gzipSync(Buffer.alloc(5 * 1024 * 1024, 0x61));
    expect(bomb.byteLength).toBeLessThan(100 * 1024);
    const t = fakeTransport(() => ({
      headers: { "content-type": "text/html", "content-encoding": "gzip", "content-length": String(bomb.byteLength) },
      body: chunks(bomb),
    }));
    expect(await codeOf(safeFetch("https://example.com/", { maxHtmlBytes: 1024 * 1024 }, deps(t.transport)))).toBe("too-large");
  });

  it("corrupt gzip is a network error", async () => {
    const t = fakeTransport(() => ({ headers: { "content-type": "text/html", "content-encoding": "gzip" }, body: chunks("not gzip") }));
    expect(await codeOf(safeFetch("https://example.com/", {}, deps(t.transport)))).toBe("network");
  });
});

describe("safeFetch — statuses and content types", () => {
  it("401, 402, 403 and 404 are distinguishable", async () => {
    const seen: Record<number, PrintFetchError> = {};
    for (const status of [401, 402, 403, 404]) {
      const t = fakeTransport(() => ({ status }));
      try {
        await safeFetch("https://example.com/", {}, deps(t.transport));
      } catch (e) {
        seen[status] = e as PrintFetchError;
      }
    }
    for (const s of [401, 402, 403, 404]) {
      expect(seen[s].code).toBe("http-status");
      expect(seen[s].status).toBe(s);
    }
    expect(new Set([401, 402, 403, 404].map((s) => seen[s].userMessage)).size).toBe(4);
  });

  it("refuses unsupported content types", async () => {
    const t = fakeTransport(() => ({ headers: { "content-type": "image/png" }, body: chunks("x") }));
    expect(await codeOf(safeFetch("https://example.com/", {}, deps(t.transport)))).toBe("unsupported-content-type");
  });

  it("HEAD returns no body", async () => {
    const t = fakeTransport(() => ({ headers: { "content-type": "text/html" }, body: chunks("should not be read") }));
    const r = await safeFetch("https://example.com/", { method: "HEAD" }, deps(t.transport));
    expect(t.calls[0].method).toBe("HEAD");
    expect(r.bytes.byteLength).toBe(0);
  });
});

describe("decodeText", () => {
  const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in ISO-8859-1

  it("uses the charset from Content-Type", () => {
    expect(decodeText(latin1, "text/html; charset=ISO-8859-1")).toBe("café");
    expect(decodeText(latin1, 'text/html; charset="iso-8859-1"')).toBe("café");
  });

  it("uses <meta charset> when the header has none", () => {
    const html = new Uint8Array([...new TextEncoder().encode('<meta charset="windows-1252"><p>'), 0x93, 0x68, 0x69, 0x94]);
    expect(decodeText(html, "text/html")).toContain("“hi”");
    const equiv = new Uint8Array([
      ...new TextEncoder().encode('<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"><p>'),
      ...latin1,
    ]);
    expect(decodeText(equiv, "text/html")).toContain("café");
  });

  it("defaults to UTF-8 and survives unknown labels", () => {
    const utf8 = new TextEncoder().encode("<p>café ✓</p>");
    expect(decodeText(utf8, "text/html")).toBe("<p>café ✓</p>");
    expect(decodeText(utf8, "")).toBe("<p>café ✓</p>");
    expect(decodeText(utf8, "text/html; charset=no-such-charset")).toBe("<p>café ✓</p>");
  });

  it("a BOM wins", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("é")]);
    expect(decodeText(bom, "text/html; charset=iso-8859-1")).toBe("é");
  });

  it("safeFetch decodes with the header charset", async () => {
    const t = fakeTransport(() => ({ headers: { "content-type": "text/html; charset=ISO-8859-1" }, body: chunks(latin1) }));
    expect((await safeFetch("https://example.com/", {}, deps(t.transport))).text).toBe("café");
  });
});

// ---------------------------------------------------------------------------
// Real node:http transport against an in-process server on 127.0.0.1.

describe("safeFetch — node transport (local test server)", () => {
  let server: http.Server;
  let port = 0;
  const seenHosts: string[] = [];
  let endlessClosed = false;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seenHosts.push(String(req.headers.host));
      if (req.url === "/gzip") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip" });
        res.end(gzipSync(Buffer.from(`<p>ua=${req.headers["user-agent"]?.slice(0, 11)}</p>`)));
      } else if (req.url === "/redirect") {
        res.writeHead(302, { location: "/gzip" });
        res.end();
      } else if (req.url === "/to-private") {
        res.writeHead(302, { location: "http://10.1.2.3/" });
        res.end();
      } else if (req.url === "/endless") {
        res.writeHead(200, { "content-type": "text/html" });
        const block = Buffer.alloc(64 * 1024, 0x61);
        const timer = setInterval(() => res.write(block), 1);
        res.on("close", () => {
          endlessClosed = true;
          clearInterval(timer);
        });
      } else if (req.url === "/slow") {
        const timer = setTimeout(() => res.end("late"), 5000);
        res.on("close", () => clearTimeout(timer));
      } else if (req.url === "/forbidden") {
        res.writeHead(403, { "content-type": "text/html" });
        res.end("no");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });

  // The test hook: loopback + the random port. App code never sets testOnly.
  const testDeps = (): SafeFetchDeps => ({
    resolve: async () => [{ address: "127.0.0.1", family: 4 }],
    testOnly: { allowLoopback: true, extraPorts: [port] },
  });

  it("without the test hook the local server is refused", async () => {
    expect(await codeOf(safeFetch(`http://127.0.0.1:${port}/gzip`))).toBe("bad-url"); // port
    expect(await codeOf(safeFetch(`http://127.0.0.1:${port}/gzip`, {}, { testOnly: { extraPorts: [port] } }))).toBe(
      "blocked-address",
    );
  });

  it("the test hook allows only loopback, not other private ranges", () => {
    expect(() => checkUrl("http://10.0.0.1/", { testOnly: { allowLoopback: true } })).toThrowError(
      expect.objectContaining({ code: "blocked-address" }),
    );
    expect(() => checkUrl("http://169.254.169.254/", { testOnly: { allowLoopback: true } })).toThrowError(
      expect.objectContaining({ code: "blocked-address" }),
    );
  });

  it("pins the socket to the resolved address while Host keeps the hostname", async () => {
    const r = await safeFetch(`http://print-test.invalid:${port}/gzip`, {}, testDeps());
    expect(r.status).toBe(200);
    expect(r.text).toBe("<p>ua=Mozilla/5.0</p>");
    expect(seenHosts.at(-1)).toBe(`print-test.invalid:${port}`);
  });

  it("follows a real redirect and refuses a real redirect to a private IP", async () => {
    const r = await safeFetch(`http://print-test.invalid:${port}/redirect`, {}, testDeps());
    expect(r.finalUrl).toBe(`http://print-test.invalid:${port}/gzip`);
    expect(await codeOf(safeFetch(`http://print-test.invalid:${port}/to-private`, {}, testDeps()))).toBe("blocked-address");
  });

  it("stops an endless response at the size limit and closes the connection", async () => {
    expect(await codeOf(safeFetch(`http://print-test.invalid:${port}/endless`, { maxHtmlBytes: 512 * 1024 }, testDeps()))).toBe(
      "too-large",
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(endlessClosed).toBe(true);
  });

  it("times out on a slow server", async () => {
    expect(await codeOf(safeFetch(`http://print-test.invalid:${port}/slow`, { timeoutMs: 100 }, testDeps()))).toBe("timeout");
  });

  it("returns 403 as a typed status error", async () => {
    try {
      await safeFetch(`http://print-test.invalid:${port}/forbidden`, {}, testDeps());
      throw new Error("should fail");
    } catch (e) {
      expect((e as PrintFetchError).code).toBe("http-status");
      expect((e as PrintFetchError).status).toBe(403);
    }
  });
});

describe("test hook is ignored outside the test runner", () => {
  it("does not allow loopback when NODE_ENV is production, even if testOnly is passed", async () => {
    const previous = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      await expect(
        safeFetch("http://127.0.0.1:8080/", {}, { testOnly: { allowLoopback: true, extraPorts: [8080] } }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/blocked-address|bad-url/) });
    } finally {
      (process.env as Record<string, string>).NODE_ENV = previous as string;
    }
  });
});
