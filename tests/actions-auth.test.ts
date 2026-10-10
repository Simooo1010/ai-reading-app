import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server actions must not touch Notion without a valid cookie.
// Notion and Next internals are mocked: nothing here reaches the network.
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
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
const updateItemStatus = vi.fn(async () => {});
vi.mock("@/lib/notion", () => ({
  ITEMS_TAG: "items",
  isPageId: (id: unknown) => typeof id === "string" && id.length > 0,
  updateItemStatus: (...args: unknown[]) => updateItemStatus(...(args as [])),
}));

import { doneItem, resetItem, skipItem, startItem, undoSkip } from "@/app/(app)/actions";
import { AUTH_COOKIE, createSessionToken } from "@/lib/auth";

const ID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  vi.stubEnv("APP_PASSWORD", "fixture-password-actions");
  cookieJar.clear();
  updateItemStatus.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const calls = [
  () => startItem(ID),
  () => doneItem(ID),
  () => skipItem(ID),
  () => resetItem(ID),
  () => undoSkip(ID, "Reading"),
];

describe("server actions require auth", () => {
  it("refuse without a cookie and never call Notion", async () => {
    for (const call of calls) {
      expect(await call()).toEqual({ ok: false, error: "Please sign in again." });
    }
    expect(updateItemStatus).not.toHaveBeenCalled();
  });

  it("refuse with a garbage cookie", async () => {
    cookieJar.set(AUTH_COOKIE, "v1.123.abc");
    for (const call of calls) {
      expect((await call()).ok).toBe(false);
    }
    expect(updateItemStatus).not.toHaveBeenCalled();
  });

  it("run as before with a valid cookie (mocked Notion)", async () => {
    cookieJar.set(AUTH_COOKIE, (await createSessionToken())!);
    for (const call of calls) {
      expect(await call()).toEqual({ ok: true });
    }
    expect(updateItemStatus).toHaveBeenCalledTimes(calls.length);
    expect(await undoSkip(ID, "Done")).toEqual({ ok: false, error: "Could not undo. Please reload." });
  });
});
