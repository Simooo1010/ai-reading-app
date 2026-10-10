import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AUTH_COOKIE, LOGIN_NEXT_HEADER, createSessionToken } from "@/lib/auth";
import { config, isPublicPath, proxy } from "@/proxy";

// Fixture password only.
const PW = "fixture-password-proxy";
const BASE = "https://reading.example.test";

beforeEach(() => {
  vi.stubEnv("APP_PASSWORD", PW);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function req(
  path: string,
  init: { method?: string; cookie?: string; headers?: Record<string, string> } = {},
) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", `${AUTH_COOKIE}=${init.cookie}`);
  return new NextRequest(new URL(path, BASE), { method: init.method ?? "GET", headers });
}

const isPass = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy: not signed in", () => {
  it.each(["/today", "/path", "/progress", "/"])("GET %s redirects to /login with next", async (p) => {
    const res = await proxy(req(p));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe(BASE);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe(p);
  });

  it("keeps the query in next", async () => {
    const res = await proxy(req("/today?x=1"));
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe("/today?x=1");
  });

  it("server action POST is refused with 401 and a client redirect header", async () => {
    const res = await proxy(
      req("/today", { method: "POST", headers: { "Next-Action": "abc123", "content-type": "text/plain" } }),
    );
    expect(res.status).toBe(401);
    expect(isPass(res)).toBe(false);
    expect(res.headers.get("x-action-redirect")).toBe("/login?next=%2Ftoday;replace");
  });

  it("plain POST (no JS) is redirected with 303, not passed on", async () => {
    const res = await proxy(req("/path", { method: "POST" }));
    expect(res.status).toBe(303);
    expect(isPass(res)).toBe(false);
  });

  it("tampered cookie counts as not signed in", async () => {
    const token = (await createSessionToken())!;
    const bad = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const res = await proxy(req("/today", { cookie: bad }));
    expect(res.status).toBe(307);
  });

  it("cookie signed with another password is refused", async () => {
    vi.stubEnv("APP_PASSWORD", "fixture-other");
    const other = (await createSessionToken())!;
    vi.stubEnv("APP_PASSWORD", PW);
    const res = await proxy(req("/today", { cookie: other }));
    expect(res.status).toBe(307);
  });

  it("APP_PASSWORD unset: even a once-valid cookie is refused (fail closed)", async () => {
    const token = (await createSessionToken())!;
    vi.stubEnv("APP_PASSWORD", "");
    const res = await proxy(req("/today", { cookie: token }));
    expect(res.status).toBe(307);
  });

  it("/login and static assets pass", async () => {
    for (const p of ["/login", "/login?next=%2Fpath", "/_next/static/css/app.css", "/favicon.ico", "/_next/image?url=x"]) {
      expect(isPass(await proxy(req(p)))).toBe(true);
    }
  });
});

describe("proxy: /login passes a sanitized next to the login action", () => {
  const forwarded = (res: Response) => res.headers.get(`x-middleware-request-${LOGIN_NEXT_HEADER}`);
  it("forwards a safe next", async () => {
    expect(forwarded(await proxy(req("/login?next=%2Fpath%3Fa%3D1")))).toBe("/path?a=1");
  });
  it("replaces unsafe or browser-supplied values", async () => {
    expect(forwarded(await proxy(req("/login?next=%2F%2Fevil.com")))).toBe("/today");
    expect(
      forwarded(await proxy(req("/login", { headers: { [LOGIN_NEXT_HEADER]: "//evil.com" } }))),
    ).toBe("/today");
  });
});

describe("proxy: signed in", () => {
  it("passes pages and server actions", async () => {
    const token = (await createSessionToken())!;
    expect(isPass(await proxy(req("/today", { cookie: token })))).toBe(true);
    expect(
      isPass(await proxy(req("/today", { method: "POST", cookie: token, headers: { "Next-Action": "abc" } }))),
    ).toBe(true);
  });

  it("GET /login goes to /today", async () => {
    const token = (await createSessionToken())!;
    const res = await proxy(req("/login", { cookie: token }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/today");
  });
});

describe("matcher and isPublicPath", () => {
  // Next's matcher syntax here is also a valid JS regex.
  const matcher = new RegExp(`^${config.matcher[0]}$`);
  it("runs on pages, skips Next static files", () => {
    for (const p of ["/", "/today", "/path", "/progress", "/login"]) expect(matcher.test(p)).toBe(true);
    for (const p of ["/_next/static/chunks/a.js", "/_next/image", "/favicon.ico"]) {
      expect(matcher.test(p)).toBe(false);
    }
  });
  it("isPublicPath", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/_next/static/media/font.woff2")).toBe(true);
    expect(isPublicPath("/today")).toBe(false);
    expect(isPublicPath("/login/x")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
    // No bypass by file extension: pages and actions ending in .js/.txt/.css stay protected.
    for (const p of ["/print/x.js", "/a.txt", "/today.css", "/path/x.png", "/progress.map"]) {
      expect(isPublicPath(p)).toBe(false);
    }
    expect(isPublicPath("/favicon.ico")).toBe(true);
  });
});
