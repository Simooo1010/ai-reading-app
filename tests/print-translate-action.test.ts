import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCheck } from "@/lib/print/fidelity";
import type { PrintLoad } from "@/lib/print/load";
import type { PrintResult } from "@/lib/print/types";

// translateToItalian must not read Notion, load a page or translate without
// a valid cookie. Notion, the loader and the translator are mocked: nothing
// here reaches the network.
const cookieJar = new Map<string, string>();
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) as string } : undefined),
  }),
}));
const ID = "0123456789abcdef0123456789abcdef";
const getItemsCached = vi.fn(async () => [
  { id: "01234567-89ab-cdef-0123-456789abcdef", title: "Fixture", author: "A", link: "https://example.com/p", readingTimeMin: 5 },
]);
vi.mock("@/lib/notion", () => ({
  isPageId: (id: unknown) => typeof id === "string" && /^[0-9a-f]{32}$/.test(id),
  getItemsCached: () => getItemsCached(),
}));
const RESULT: PrintResult = {
  status: "ok",
  document: { url: "https://example.com/p", title: "T", subtitle: "", author: "", publication: "", date: "", elements: [] },
  check: emptyCheck(),
  warnings: [],
  message: "",
  source: "web",
};
const loadPrintableSafe = vi.fn(async (): Promise<PrintLoad> => ({ kind: "document", result: RESULT }));
vi.mock("@/lib/print/safe-load", () => ({ loadPrintableSafe: () => loadPrintableSafe() }));
const INFO = { language: "it", status: "complete", translated: 1, total: 1, engines: ["gemini"] };
const translatePrintResult = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ result: RESULT, info: INFO }));
vi.mock("@/lib/print/translate", () => ({ translatePrintResult: (...args: unknown[]) => translatePrintResult(...args) }));

import { translateToItalian } from "@/app/print/[id]/actions";
import { AUTH_COOKIE, createSessionToken } from "@/lib/auth";
import { TRANSLATE_MESSAGES } from "@/lib/print/translate/types";

beforeEach(() => {
  vi.stubEnv("APP_PASSWORD", "fixture-password-translate");
  cookieJar.clear();
  getItemsCached.mockClear();
  loadPrintableSafe.mockClear();
  translatePrintResult.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const signIn = async () => cookieJar.set(AUTH_COOKIE, (await createSessionToken())!);

describe("translateToItalian", () => {
  it("refuses without a valid cookie and touches nothing", async () => {
    expect(await translateToItalian(ID)).toEqual({ ok: false, error: TRANSLATE_MESSAGES.signIn });
    cookieJar.set(AUTH_COOKIE, "v1.123.abc");
    expect((await translateToItalian(ID)).ok).toBe(false);
    expect(getItemsCached).not.toHaveBeenCalled();
    expect(loadPrintableSafe).not.toHaveBeenCalled();
    expect(translatePrintResult).not.toHaveBeenCalled();
  });

  it("translates a printable document when signed in", async () => {
    await signIn();
    expect(await translateToItalian(ID)).toEqual({ ok: true, result: RESULT, info: INFO });
  });

  it("refuses bad ids, unknown items, PDFs and blocked results", async () => {
    await signIn();
    const notSupported = { ok: false, error: TRANSLATE_MESSAGES.notSupported };
    expect(await translateToItalian("../etc")).toEqual(notSupported);
    expect(await translateToItalian("f".repeat(32))).toEqual(notSupported);
    loadPrintableSafe.mockResolvedValueOnce({ kind: "open-pdf", url: "https://example.com/a.pdf", reason: "direct-pdf", message: "" });
    expect(await translateToItalian(ID)).toEqual(notSupported);
    loadPrintableSafe.mockResolvedValueOnce({ kind: "document", result: { ...RESULT, status: "blocked" } });
    expect(await translateToItalian(ID)).toEqual(notSupported);
    loadPrintableSafe.mockResolvedValueOnce({ kind: "document", result: { ...RESULT, document: undefined } });
    expect(await translateToItalian(ID)).toEqual(notSupported);
    expect(translatePrintResult).not.toHaveBeenCalled();
  });

  it("a slow load leaves less time: the budget shrinks, and with under 5 s left nothing is started", async () => {
    await signIn();
    let t = Date.now(); // real time: the session cookie must stay valid
    vi.spyOn(Date, "now").mockImplementation(() => t);
    const budgets: number[] = [];
    translatePrintResult.mockImplementationOnce(async (...args: unknown[]) => {
      budgets.push((args[1] as { budgetMs: number }).budgetMs);
      return { result: RESULT, info: INFO };
    });
    loadPrintableSafe.mockImplementationOnce(async () => {
      t += 20_000;
      return { kind: "document", result: RESULT };
    });
    expect((await translateToItalian(ID)).ok).toBe(true);
    expect(budgets).toEqual([30_000]);
    loadPrintableSafe.mockImplementationOnce(async () => {
      t += 46_000;
      return { kind: "document", result: RESULT };
    });
    expect(await translateToItalian(ID)).toEqual({ ok: false, error: TRANSLATE_MESSAGES.unavailable });
    expect(budgets).toHaveLength(1);
  });

  it("says Italian is not available when the translator gives up or throws (no raw error)", async () => {
    await signIn();
    translatePrintResult.mockResolvedValueOnce({ unavailable: true });
    expect(await translateToItalian(ID)).toEqual({ ok: false, error: TRANSLATE_MESSAGES.unavailable });
    translatePrintResult.mockRejectedValueOnce(new Error("secret detail"));
    expect(await translateToItalian(ID)).toEqual({ ok: false, error: TRANSLATE_MESSAGES.unavailable });
  });
});
