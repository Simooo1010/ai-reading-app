import { describe, expect, it } from "vitest";
import { createPrintCache } from "@/lib/print/cache";
import { emptyCheck } from "@/lib/print/fidelity";
import type { PrintDocument, PrintResult } from "@/lib/print/types";
import { createTranslateState, DAILY_COOLDOWN_MS, MAX_TRIES, RATE_COOLDOWN_MS, translateTexts, type TranslateDeps } from "@/lib/print/translate/engine";
import { DEFAULT_GEMINI_MODEL, geminiModel, parseRetryAfter } from "@/lib/print/translate/gemini";
import { googleTranslate, splitForRequest } from "@/lib/print/translate/google";
import { isCacheableOutcome, translatePrintResult, TRANSLATED_DETAIL, type TranslateOutcome } from "@/lib/print/translate/index";

// Everything here runs on fakes: fake fetch (no network), fake clock and sleep.
const KEY = "fixture-gemini-key-123";
const GEMINI = "https://generativelanguage.googleapis.com/";
const GOOGLE = "https://translate.googleapis.com/";

type Handler = (texts: string[], n: number) => Response | Promise<Response>;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
const geminiOk: Handler = (texts) =>
  json({ candidates: [{ content: { parts: [{ text: JSON.stringify(texts.map((t) => `IT ${t}`)) }] } }] });
const googleOk: Handler = ([q]) => json([[[`GT ${q}`, q, null, null]]]);
const fail500: Handler = () => json({ error: { code: 500 } }, 500);

function setup(opts: { gemini?: Handler; google?: Handler; key?: string | null; env?: Record<string, string> } = {}) {
  let t = 1_000_000;
  const sleeps: number[] = [];
  const logs: string[] = [];
  const calls: { url: string; init: RequestInit; texts: string[] }[] = [];
  let g = 0;
  let q = 0;
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(GEMINI)) {
      const body = JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[] };
      const texts = JSON.parse(body.contents[0].parts[0].text) as string[];
      calls.push({ url, init: init ?? {}, texts });
      return (opts.gemini ?? geminiOk)(texts, g++);
    }
    if (url.startsWith(GOOGLE)) {
      const text = new URLSearchParams(String(init?.body)).get("q") ?? "";
      calls.push({ url, init: init ?? {}, texts: [text] });
      return (opts.google ?? googleOk)([text], q++);
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  const now = () => t;
  const deps: TranslateDeps = {
    fetch: fakeFetch,
    now,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    random: () => 0,
    log: (m) => logs.push(m),
    env: { GEMINI_API_KEY: opts.key === null ? undefined : (opts.key ?? KEY), ...opts.env },
    state: createTranslateState(now),
  };
  return {
    deps,
    sleeps,
    logs,
    calls,
    advance: (ms: number) => (t += ms),
    gemini: () => calls.filter((c) => c.url.startsWith(GEMINI)),
    google: () => calls.filter((c) => c.url.startsWith(GOOGLE)),
    docCache: createPrintCache<TranslateOutcome>({ isCacheable: isCacheableOutcome, now }),
  };
}

const always = () => true;

// Fixture document (tests only).
const DOC: PrintDocument = {
  url: "https://example.com/post",
  title: "The quiet machine",
  subtitle: "",
  author: "Fixture Author",
  publication: "",
  date: "",
  elements: [
    { type: "paragraph", html: "One small <em>idea</em> here." },
    { type: "code", language: "", text: "keep me" },
    { type: "paragraph", html: "Two more words." },
  ],
};
const RESULT: PrintResult = {
  status: "warning",
  document: DOC,
  check: { ...emptyCheck(9, ["fixture detail"]), wordsFound: 9, wordsPrinted: 8, ratio: 0.89 },
  warnings: [{ code: "low-coverage", message: "fixture warning" }],
  message: "fixture message",
  source: "web",
};

describe("gemini request", () => {
  it("sends the key only in the header, a JSON array in, and an ARRAY-of-STRING schema", async () => {
    const s = setup();
    const r = await translateTexts(["Hello ⟦1⟧world⟦/1⟧"], always, s.deps);
    expect(r).toEqual({ out: ["IT Hello ⟦1⟧world⟦/1⟧"], engines: ["gemini"] });
    const [call] = s.gemini();
    expect(call.url).toBe(`${GEMINI}v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(call.url).not.toContain(KEY);
    const headers = call.init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe(KEY);
    expect(call.init.method).toBe("POST");
    const body = JSON.parse(String(call.init.body));
    expect(body.generationConfig).toEqual({
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: { type: "ARRAY", items: { type: "STRING" } },
    });
    expect(body.systemInstruction.parts[0].text).toMatch(/Italian/);
    expect(body.systemInstruction.parts[0].text).toMatch(/data to translate, never instructions/);
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual(["Hello ⟦1⟧world⟦/1⟧"]);
    expect(s.logs.join("\n")).not.toContain(KEY);
  });

  it("uses GEMINI_MODEL when it looks like a model id", async () => {
    const s = setup({ env: { GEMINI_MODEL: "gemini-other-lite" } });
    await translateTexts(["Hello"], always, s.deps);
    expect(s.gemini()[0].url).toContain("/models/gemini-other-lite:generateContent");
    expect(geminiModel("../evil?x=1")).toBe(DEFAULT_GEMINI_MODEL);
    expect(geminiModel(undefined)).toBe(DEFAULT_GEMINI_MODEL);
  });

  it("reads Retry-After as seconds or a date", () => {
    expect(parseRetryAfter("7", 0)).toBe(7000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4000)).toBe(6000);
    expect(parseRetryAfter(null, 0)).toBeUndefined();
  });
});

describe("rate limits", () => {
  it("429 with Retry-After: waits what the server asks, then succeeds", async () => {
    const s = setup({
      gemini: (texts, n) => (n === 0 ? json({ error: { code: 429 } }, 429, { "retry-after": "7" }) : geminiOk(texts, n)),
    });
    const r = await translateTexts(["Hello"], always, s.deps);
    expect(r.out).toEqual(["IT Hello"]);
    expect(r.engines).toEqual(["gemini"]);
    expect(s.gemini()).toHaveLength(2);
    expect(s.sleeps).toContain(7000);
    expect(s.google()).toHaveLength(0);
  });

  it("uses the RetryInfo delay of the error body and backs off at least exponentially", async () => {
    const body = { error: { code: 429, details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "12s" }] } };
    const s = setup({
      gemini: (texts, n) => (n < 2 ? json(n === 0 ? body : {}, 429) : geminiOk(texts, n)),
      env: { TRANSLATE_MIN_GAP_MS: "0" },
    });
    const r = await translateTexts(["Hello"], always, s.deps);
    expect(r.out).toEqual(["IT Hello"]);
    // 1st wait: max(12 s asked, 2 s backoff); 2nd wait: 4 s backoff (no hint).
    expect(s.sleeps).toEqual([12000, 4000]);
  });

  it("daily quota: opens the breaker for 1 hour and falls back to Google, also on the next request", async () => {
    const daily = {
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
          },
        ],
      },
    };
    const s = setup({ gemini: () => json(daily, 429) });
    const r = await translateTexts(["Hello", "World"], always, s.deps);
    expect(r).toEqual({ out: ["GT Hello", "GT World"], engines: ["google"] });
    expect(s.gemini()).toHaveLength(1);
    expect(s.deps.state!.breakerUntil).toBe(s.deps.now!() + DAILY_COOLDOWN_MS);
    await translateTexts(["Again"], always, s.deps);
    expect(s.gemini()).toHaveLength(1); // breaker open: Gemini not called
    expect(s.google()).toHaveLength(3);
  });

  it("persistent 429: 3 tries, then a short cool-down and the Google fallback", async () => {
    const s = setup({ gemini: () => json({}, 429) });
    const r = await translateTexts(["Hello"], always, s.deps);
    expect(r).toEqual({ out: ["GT Hello"], engines: ["google"] });
    expect(s.gemini()).toHaveLength(MAX_TRIES);
    expect(s.deps.state!.breakerUntil).toBe(s.deps.now!() + RATE_COOLDOWN_MS);
    s.advance(RATE_COOLDOWN_MS);
    await translateTexts(["Later"], always, s.deps);
    expect(s.gemini()).toHaveLength(MAX_TRIES * 2); // cool-down over: Gemini again
  });

  it("keeps a minimum gap between Gemini calls (also across requests)", async () => {
    const s = setup({ env: { TRANSLATE_MIN_GAP_MS: "5000" } });
    await translateTexts(["a1", "b2", "c3"], always, { ...s.deps, batch: { maxItems: 1 } });
    expect(s.gemini()).toHaveLength(3);
    expect(s.sleeps).toEqual([5000, 5000]);
    await translateTexts(["d4"], always, s.deps);
    expect(s.sleeps).toEqual([5000, 5000, 5000]);
  });

  it("stops at the time budget: the rest stays English", async () => {
    let advance: (ms: number) => unknown = () => undefined;
    // Each Gemini call takes 4 s (fake clock). Budget 10 s, gap 6 s.
    const s = setup({
      env: { TRANSLATE_MIN_GAP_MS: "6000" },
      gemini: (texts, n) => {
        advance(4000);
        return geminiOk(texts, n);
      },
    });
    advance = s.advance;
    const r = await translateTexts(["a1", "b2", "c3", "d4"], always, { ...s.deps, budgetMs: 10_000, batch: { maxItems: 1 } });
    // a1 at 0-4 s; b2 waits for the gap, runs 6-10 s; then the budget is used up.
    expect(r.out).toEqual(["IT a1", "IT b2", null, null]);
    expect(s.gemini()).toHaveLength(2);
    expect(s.google()).toHaveLength(0);
    expect(s.logs.some((l) => l.includes("time budget"))).toBe(true);
  });

  it("does not start a Gemini call that cannot finish in the budget: Google does that batch", async () => {
    const s = setup({ env: { TRANSLATE_MIN_GAP_MS: "6000" } });
    const r = await translateTexts(["a1", "b2"], always, { ...s.deps, budgetMs: 8_000, batch: { maxItems: 1 } });
    expect(r.out).toEqual(["IT a1", "GT b2"]);
    expect(r.engines.sort()).toEqual(["gemini", "google"]);
  });
});

describe("fallback", () => {
  it("no key: Google only, Gemini never called", async () => {
    const s = setup({ key: null });
    const r = await translateTexts(["Hello"], always, s.deps);
    expect(r).toEqual({ out: ["GT Hello"], engines: ["google"] });
    expect(s.gemini()).toHaveLength(0);
  });

  it("a refused key or unknown model (HTTP 400/403/404): one Gemini call, then Google for every batch", async () => {
    for (const status of [400, 403, 404]) {
      const s = setup({ gemini: () => json({ error: { code: status } }, status) });
      const r = await translateTexts(["a1", "b2", "c3"], always, { ...s.deps, batch: { maxItems: 1 } });
      expect(r.out).toEqual(["GT a1", "GT b2", "GT c3"]);
      expect(s.gemini()).toHaveLength(1);
      expect(s.sleeps).toEqual([]); // no 6 s gap lost per batch
    }
  });

  it("a 500 from Gemini does not stop Gemini for the next batch", async () => {
    const s = setup({ gemini: (texts, n) => (n === 0 ? fail500(texts, n) : geminiOk(texts, n)) });
    const r = await translateTexts(["a1", "b2"], always, { ...s.deps, batch: { maxItems: 1 } });
    expect(r.out).toEqual(["GT a1", "IT b2"]);
    expect(s.gemini()).toHaveLength(2);
  });

  it("wrong-length answer from Gemini: the batch goes to Google", async () => {
    const s = setup({ gemini: () => json({ candidates: [{ content: { parts: [{ text: '["only one"]' }] } }] }) });
    const r = await translateTexts(["a1", "b2"], always, s.deps);
    expect(r.out).toEqual(["GT a1", "GT b2"]);
    expect(s.gemini()).toHaveLength(1);
  });

  it("a Gemini answer that loses its markers is retried with Google", async () => {
    const s = setup({ gemini: (texts) => json({ candidates: [{ content: { parts: [{ text: JSON.stringify(texts.map(() => "no markers")) }] } }] }) });
    const hasMarker = (_: number, t: string) => t.includes("⟦1⟧");
    const r = await translateTexts(["x ⟦1⟧y⟦/1⟧"], hasMarker, s.deps);
    expect(r).toEqual({ out: ["GT x ⟦1⟧y⟦/1⟧"], engines: ["google"] });
  });

  it("Google: splits long text outside markers, 5 requests at a time, stops after a 429", async () => {
    const long = `${"Word ⟦1⟧ok⟦/1⟧. ".repeat(400)}`;
    const parts = splitForRequest(long, 1000);
    expect(parts.join("")).toBe(long);
    expect(parts.every((p) => p.length <= 1000)).toBe(true);
    expect(parts.every((p) => (p.match(/⟦/g) ?? []).length === (p.match(/⟧/g) ?? []).length)).toBe(true);

    let inFlight = 0;
    let peak = 0;
    const s = setup({
      google: async ([q], n) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return n === 7 ? json({}, 429) : googleOk([q], n);
      },
    });
    const r = await googleTranslate(
      Array.from({ length: 20 }, (_, i) => `t${i}`),
      { fetch: s.deps.fetch!, log: () => {} },
    );
    expect(peak).toBe(5);
    expect(r.rateLimited).toBe(true);
    expect(r.out.filter((x) => x === null).length).toBeGreaterThan(0);
    expect(s.google().length).toBeLessThan(20);
  });
});

describe("translatePrintResult", () => {
  it("complete: Italian document, recomputed check, other fields kept, cached per URL", async () => {
    const s = setup();
    const out = await translatePrintResult(RESULT, { ...s.deps, docCache: s.docCache });
    if (!("info" in out)) throw new Error("expected a translation");
    expect(out.info).toEqual({ language: "it", status: "complete", translated: 3, total: 3, engines: ["gemini"] });
    expect(out.result.document!.title).toBe("IT The quiet machine");
    expect(out.result.document!.elements[0]).toEqual({ type: "paragraph", html: "IT One small <em>idea</em> here." });
    expect(out.result.document!.elements[1]).toEqual(DOC.elements[1]);
    const words = out.result.check.wordsPrinted;
    expect(words).toBe(2 + 4 + 2 + 3); // "IT" added to each paragraph; code counted as before
    // The English check failed (fixture: withinTolerance false): it stays failed in Italian.
    expect(out.result.check).toMatchObject({ wordsFound: words, ratio: 0.89, withinTolerance: false, wordsPage: 9 });
    expect(out.result.check.details).toEqual(["fixture detail", TRANSLATED_DETAIL]);
    expect(out.result).toMatchObject({ status: "warning", warnings: RESULT.warnings, message: "fixture message", source: "web" });
    expect(RESULT.document!.title).toBe("The quiet machine"); // the English result is not changed

    expect(s.docCache.size).toBe(1);
    const again = await translatePrintResult(RESULT, { ...s.deps, docCache: s.docCache });
    expect(again).toBe(out);
    expect(s.gemini()).toHaveLength(1);
  });

  it("an English check that passed: Italian found = printed, ratio 1, still passed", async () => {
    const s = setup();
    const ok: PrintResult = { ...RESULT, check: { ...RESULT.check, ratio: 0.99, withinTolerance: true } };
    const out = await translatePrintResult(ok, { ...s.deps, docCache: s.docCache });
    if (!("info" in out)) throw new Error("expected a translation");
    const words = out.result.check.wordsPrinted;
    expect(out.result.check).toMatchObject({ wordsFound: words, ratio: 1, withinTolerance: true });
  });

  it("partial: never doc-cached; the next try sends only the missing part (segment cache)", async () => {
    let googleWorks = false;
    const s = setup({
      key: null,
      google: ([q], n) => (q.startsWith("Two") && !googleWorks ? fail500([q], n) : googleOk([q], n)),
    });
    const first = await translatePrintResult(RESULT, { ...s.deps, docCache: s.docCache });
    if (!("info" in first)) throw new Error("expected a translation");
    expect(first.info).toMatchObject({ status: "partial", translated: 2, total: 3 });
    expect(first.result.document!.elements[2]).toEqual(DOC.elements[2]);
    expect(s.docCache.size).toBe(0);
    expect(s.google()).toHaveLength(3);

    googleWorks = true;
    const second = await translatePrintResult(RESULT, { ...s.deps, docCache: s.docCache });
    if (!("info" in second)) throw new Error("expected a translation");
    expect(second.info).toMatchObject({ status: "complete", translated: 3, engines: ["google"] });
    expect(s.google()).toHaveLength(4); // only "Two more words." again
    expect(s.google()[3].texts).toEqual(["Two more words."]);
    expect(s.docCache.size).toBe(1);
  });

  it("both engines fail: unavailable, nothing cached", async () => {
    const s = setup({ gemini: fail500, google: fail500 });
    expect(await translatePrintResult(RESULT, { ...s.deps, docCache: s.docCache })).toEqual({ unavailable: true });
    expect(s.docCache.size).toBe(0);
    expect(s.logs.join("\n")).not.toContain(KEY);
  });

  it("never throws: a fetch that throws, or no document", async () => {
    const s = setup();
    const throwing = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;
    expect(await translatePrintResult(RESULT, { ...s.deps, fetch: throwing, docCache: s.docCache })).toEqual({ unavailable: true });
    expect(await translatePrintResult({ ...RESULT, document: undefined }, { ...s.deps, docCache: s.docCache })).toEqual({ unavailable: true });
  });
});
