import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The login form also sends a hidden "username" field (for iPhone Passwords).
// The login action must ignore it: only "password" counts.
// Next internals are mocked; nothing here reaches the network.
const setCookie = vi.fn();
let nextHeader: string | null = "/path";
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: setCookie, get: () => undefined }),
  headers: async () => ({ get: () => nextHeader }),
}));
class RedirectSignal extends Error {
  constructor(public to: string) {
    super(`redirect ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));

import { login } from "@/app/login/actions";
import { AUTH_COOKIE } from "@/lib/auth";

const PW = "fixture-password-login";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.stubEnv("APP_PASSWORD", PW);
  setCookie.mockClear();
  nextHeader = "/path";
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("login action with the hidden username field", () => {
  it("right password + username: signs in and goes to next", async () => {
    const err = await login({ error: null }, form({ username: "AI Reading", password: PW })).catch((e) => e);
    expect(err).toBeInstanceOf(RedirectSignal);
    expect((err as RedirectSignal).to).toBe("/path");
    expect(setCookie).toHaveBeenCalledTimes(1);
    expect(setCookie.mock.calls[0][0]).toBe(AUTH_COOKIE);
  });

  it("the username is never taken as the password", async () => {
    const res = await login({ error: null }, form({ username: PW, password: "wrong" }));
    expect(res.error).toBe("That password is not right. Try again.");
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("unsafe next falls back to /today", async () => {
    nextHeader = "//evil.example";
    const err = await login({ error: null }, form({ username: "x", password: PW })).catch((e) => e);
    expect((err as RedirectSignal).to).toBe("/today");
  });
});
