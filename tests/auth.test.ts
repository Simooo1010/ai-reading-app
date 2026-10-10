import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/headers so isAuthenticated/requireAuth can run outside Next.
const cookieJar = new Map<string, string>();
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) as string } : undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  AUTH_COOKIE,
  MIN_FAILURE_DELAY_MS,
  SESSION_MAX_AGE_S,
  attemptLogin,
  authCookieOptions,
  checkPassword,
  createSessionToken,
  createThrottle,
  isAuthenticated,
  requireAuth,
  requireAuthOrRedirect,
  sanitizeNextPath,
  timingSafeEqual,
  verifySessionToken,
} from "@/lib/auth";

// Fixture passwords only (never the real one).
const PW = "fixture-password-1";
const OTHER_PW = "fixture-password-2";
const NOW = 1_780_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.stubEnv("APP_PASSWORD", PW);
  cookieJar.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("session token", () => {
  it("round-trips and has the v1.<expiry>.<sig> shape", async () => {
    const token = await createSessionToken(NOW);
    expect(token).toMatch(/^v1\.\d{13}\.[A-Za-z0-9_-]{43}$/);
    expect(Number(token!.split(".")[1])).toBe(NOW + 30 * DAY);
    expect(await verifySessionToken(token, NOW)).toBe(true);
    expect(await verifySessionToken(token, NOW + 29 * DAY)).toBe(true);
    expect(token).not.toContain(PW);
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken(NOW);
    expect(await verifySessionToken(token, NOW + 30 * DAY)).toBe(false);
    expect(await verifySessionToken(token, NOW + 31 * DAY)).toBe(false);
  });

  it("rejects a tampered payload (later expiry)", async () => {
    const token = (await createSessionToken(NOW))!;
    const [v, exp, sig] = token.split(".");
    const forged = `${v}.${Number(exp) + 1000}.${sig}`;
    expect(await verifySessionToken(forged, NOW)).toBe(false);
  });

  it("rejects a tampered signature, including the last character", async () => {
    const token = (await createSessionToken(NOW))!;
    const flip = (c: string) => (c === "A" ? "B" : "A");
    const lastChanged = token.slice(0, -1) + flip(token.slice(-1));
    const firstSig = token.lastIndexOf(".") + 1;
    const midChanged =
      token.slice(0, firstSig) + flip(token[firstSig]) + token.slice(firstSig + 1);
    expect(await verifySessionToken(lastChanged, NOW)).toBe(false);
    expect(await verifySessionToken(midChanged, NOW)).toBe(false);
  });

  it("rejects a wrong version", async () => {
    const token = (await createSessionToken(NOW))!;
    expect(await verifySessionToken(token.replace(/^v1/, "v2"), NOW)).toBe(false);
    expect(await verifySessionToken(token.replace(/^v1/, "V1"), NOW)).toBe(false);
  });

  it("rejects garbage, empty, non-string and oversized input without throwing", async () => {
    const bad: unknown[] = [
      "",
      " ",
      "v1",
      "v1..",
      "v1.abc.def",
      "v1.1780000000000.",
      `v1.${NOW + DAY}.${"A".repeat(43)}`,
      "x".repeat(10_000),
      `v1.${NOW + DAY}.${"A".repeat(5000)}`,
      "v1.1780000000000.%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
      null,
      undefined,
      123,
      {},
    ];
    for (const b of bad) {
      await expect(verifySessionToken(b, NOW)).resolves.toBe(false);
    }
  });

  it("rejects an expiry further away than 30 days", async () => {
    // Signed correctly but with a far expiry: made by signing at a later "now".
    const future = (await createSessionToken(NOW + 365 * DAY))!;
    expect(await verifySessionToken(future, NOW)).toBe(false);
  });

  it("tokens made with another password do not verify (password change logs out)", async () => {
    vi.stubEnv("APP_PASSWORD", OTHER_PW);
    const other = await createSessionToken(NOW);
    vi.stubEnv("APP_PASSWORD", PW);
    expect(await verifySessionToken(other, NOW)).toBe(false);
  });

  it("fails closed when APP_PASSWORD is unset or empty", async () => {
    const token = await createSessionToken(NOW);
    vi.stubEnv("APP_PASSWORD", "");
    expect(await createSessionToken(NOW)).toBeNull();
    expect(await verifySessionToken(token, NOW)).toBe(false);
    vi.stubEnv("APP_PASSWORD", undefined);
    expect(await verifySessionToken(token, NOW)).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("compares bytes", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("checkPassword", () => {
  it("accepts the right password", async () => {
    expect(await checkPassword(PW)).toBe(true);
  });
  it("rejects wrong, near-miss, empty and non-string input", async () => {
    for (const bad of [OTHER_PW, PW + " ", PW.toUpperCase(), PW.slice(0, -1), "", null, undefined, 42]) {
      expect(await checkPassword(bad)).toBe(false);
    }
  });
  it("rejects oversized input", async () => {
    expect(await checkPassword("x".repeat(5000))).toBe(false);
  });
  it("fails closed when APP_PASSWORD is unset or empty", async () => {
    vi.stubEnv("APP_PASSWORD", "");
    expect(await checkPassword("")).toBe(false);
    expect(await checkPassword("anything")).toBe(false);
    vi.stubEnv("APP_PASSWORD", undefined);
    expect(await checkPassword("")).toBe(false);
    expect(await checkPassword("undefined")).toBe(false);
  });
});

describe("sanitizeNextPath", () => {
  it.each([
    ["/today", "/today"],
    ["/path", "/path"],
    ["/today?x=1", "/today?x=1"],
    ["/progress?a=1&b=2", "/progress?a=1&b=2"],
  ])("keeps %s", (input, out) => {
    expect(sanitizeNextPath(input)).toBe(out);
  });

  it.each([
    ["//evil.com"],
    ["//evil.com/today"],
    ["/\\evil.com"],
    ["\\\\evil.com"],
    ["https://x"],
    ["http://evil.com/today"],
    ["javascript:alert(1)"],
    ["/%2F%2Fevil.com"],
    ["/%2fevil.com"],
    ["%2F%2Fevil.com"],
    ["/%5Cevil.com"],
    ["/today%0d%0aSet-Cookie:x"],
    ["/today\nx"],
    ["/today\tx"],
    ["/%E0%A4%A"],
    ["today"],
    [""],
    ["/login"],
    ["/login?next=/today"],
  ])("rejects %j", (input) => {
    expect(sanitizeNextPath(input)).toBe("/today");
  });

  it("rejects non-strings and very long input", () => {
    expect(sanitizeNextPath(null)).toBe("/today");
    expect(sanitizeNextPath(undefined)).toBe("/today");
    expect(sanitizeNextPath(["/path"])).toBe("/today");
    expect(sanitizeNextPath("/" + "a".repeat(3000))).toBe("/today");
  });
});

describe("cookie options", () => {
  it("is httpOnly, lax, path /, 30 days", () => {
    const o = authCookieOptions();
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
    expect(o.maxAge).toBe(30 * 24 * 60 * 60);
    expect(SESSION_MAX_AGE_S).toBe(2_592_000);
  });
  it("is secure only in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(authCookieOptions().secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(authCookieOptions().secure).toBe(false);
    vi.stubEnv("NODE_ENV", "test");
    expect(authCookieOptions().secure).toBe(false);
  });
});

describe("throttle", () => {
  it("locks after 5 failures in 15 minutes and unlocks when they age out", () => {
    const t = createThrottle(5, 15 * 60 * 1000);
    for (let i = 0; i < 4; i++) t.recordFailure(NOW + i * 1000);
    expect(t.isLocked(NOW + 5000)).toBe(false);
    t.recordFailure(NOW + 5000);
    expect(t.isLocked(NOW + 6000)).toBe(true);
    // The first failure ages out after 15 minutes.
    expect(t.isLocked(NOW + 15 * 60 * 1000 + 1)).toBe(false);
  });
  it("reset clears the count", () => {
    const t = createThrottle(2, 1000);
    t.recordFailure(NOW);
    t.recordFailure(NOW);
    expect(t.isLocked(NOW)).toBe(true);
    t.reset();
    expect(t.isLocked(NOW)).toBe(false);
  });
});

describe("attemptLogin", () => {
  function deps() {
    let clock = NOW;
    const slept: number[] = [];
    return {
      slept,
      d: {
        now: () => clock,
        sleep: async (ms: number) => {
          slept.push(ms);
          clock += ms;
        },
        throttle: createThrottle(5, 15 * 60 * 1000),
      },
    };
  }

  it("right password: token + cookie options, no delay", async () => {
    const { d, slept } = deps();
    const r = await attemptLogin(PW, d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await verifySessionToken(r.token, NOW)).toBe(true);
    expect(r.token).not.toContain(PW);
    expect(r.cookie.httpOnly).toBe(true);
    expect(r.cookie.maxAge).toBe(SESSION_MAX_AGE_S);
    expect(slept).toEqual([]);
  });

  it("wrong password: ok false after the minimum delay", async () => {
    const { d, slept } = deps();
    const r = await attemptLogin("nope", d);
    expect(r).toEqual({ ok: false, reason: "wrong" });
    expect(slept).toEqual([MIN_FAILURE_DELAY_MS]);
    expect(MIN_FAILURE_DELAY_MS).toBeGreaterThanOrEqual(400);
  });

  it("locks after 5 wrong tries, then refuses even the right password", async () => {
    const { d } = deps();
    for (let i = 0; i < 5; i++) {
      expect((await attemptLogin("nope", d)).ok).toBe(false);
    }
    expect(await attemptLogin(PW, d)).toEqual({ ok: false, reason: "locked" });
  });

  it("parallel wrong guesses count as separate tries (no burst past the limit)", async () => {
    const { d } = deps();
    // 12 guesses fired at the same moment, before any of them finishes.
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => attemptLogin(`guess-${i}`, d)),
    );
    const checked = results.filter((r) => !r.ok && r.reason === "wrong").length;
    const locked = results.filter((r) => !r.ok && r.reason === "locked").length;
    expect(checked).toBe(5);
    expect(locked).toBe(7);
  });

  it("a right password clears the tries it reserved", async () => {
    const { d } = deps();
    for (let i = 0; i < 4; i++) await attemptLogin("nope", d);
    expect((await attemptLogin(PW, d)).ok).toBe(true);
    // Counter was reset: five more wrong tries are needed to lock again.
    for (let i = 0; i < 5; i++) {
      expect(await attemptLogin("nope", d)).toEqual({ ok: false, reason: "wrong" });
    }
    expect(await attemptLogin("nope", d)).toEqual({ ok: false, reason: "locked" });
  });

  it("fails closed when APP_PASSWORD is unset", async () => {
    vi.stubEnv("APP_PASSWORD", undefined);
    const { d } = deps();
    expect(await attemptLogin("", d)).toEqual({ ok: false, reason: "wrong" });
    expect(await attemptLogin("undefined", d)).toEqual({ ok: false, reason: "wrong" });
  });
});

describe("isAuthenticated / requireAuth (mocked cookies)", () => {
  it("no cookie: not signed in, actions get the B1 message", async () => {
    expect(await isAuthenticated()).toBe(false);
    expect(await requireAuth()).toEqual({ ok: false, error: "Please sign in again." });
  });
  it("valid cookie: ok", async () => {
    cookieJar.set(AUTH_COOKIE, (await createSessionToken())!);
    expect(await isAuthenticated()).toBe(true);
    expect(await requireAuth()).toEqual({ ok: true });
  });
  it("tampered cookie: refused", async () => {
    const token = (await createSessionToken())!;
    cookieJar.set(AUTH_COOKIE, token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA"));
    expect(await requireAuth()).toEqual({ ok: false, error: "Please sign in again." });
  });
  it("requireAuthOrRedirect sends to /login with next", async () => {
    await expect(requireAuthOrRedirect("/path")).rejects.toThrow(
      "REDIRECT:/login?next=%2Fpath",
    );
    cookieJar.set(AUTH_COOKIE, (await createSessionToken())!);
    await expect(requireAuthOrRedirect("/path")).resolves.toBeUndefined();
  });
});
