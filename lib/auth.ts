// Password gate (SPEC §8). Server side only: used by proxy.ts, server
// components and server actions. Never import this from a client component.
//
// How it works
// - One shared password: APP_PASSWORD (environment variable, never in code).
// - After a right password the server sets the cookie `rr_auth` with a
//   signed token `v1.<expiresAtMs>.<base64url HMAC-SHA256>`. The cookie never
//   holds the password.
// - The HMAC key is derived from APP_PASSWORD plus a fixed context string, so
//   no extra secret is needed. Consequence: changing APP_PASSWORD makes every
//   old token invalid, so it logs everyone out.
// - Fail closed: if APP_PASSWORD is unset or empty, nobody can sign in and
//   every token is rejected.
// - Web Crypto (crypto.subtle) only, so the same code runs in the proxy and
//   in Node (server components, server actions, tests).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export const AUTH_COOKIE = "rr_auth";
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE_S = SESSION_DAYS * 24 * 60 * 60;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_S * 1000;
const TOKEN_VERSION = "v1";
const KEY_CONTEXT = "ai-reading-app/rr_auth/session-hmac/v1";
/** Longer tokens are rejected before any parsing or crypto. */
const MAX_TOKEN_LENGTH = 128;
/** Longer password inputs are rejected before hashing. */
const MAX_PASSWORD_LENGTH = 1024;
export const DEFAULT_NEXT_PATH = "/today";
export const SIGN_IN_AGAIN = "Please sign in again.";
/**
 * Request header set by proxy.ts on /login requests: the sanitized `next`
 * query value. The login action reads it, so the page needs no
 * searchParams (it stays static and works without JavaScript). Any value
 * the browser sends under this name is removed by the proxy.
 */
export const LOGIN_NEXT_HEADER = "x-rr-login-next";

const encoder = new TextEncoder();

// ---------- Secret ----------

let warnedMissingSecret = false;

/** APP_PASSWORD, or null when unset/empty (fail closed). Never logged. */
function getSecret(): string | null {
  const secret = process.env.APP_PASSWORD;
  if (typeof secret !== "string" || secret.length === 0) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.error(
        "[auth] APP_PASSWORD is not set. Sign-in is disabled and every protected request is sent to /login.",
      );
    }
    return null;
  }
  return secret;
}

// ---------- Bytes helpers ----------

/** Constant-time compare. Different lengths return false at once (lengths are not secret here). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

// ---------- Signing key ----------

// Cache: one derived key per secret value (the secret itself is not stored
// anywhere else; this is the same process memory that holds process.env).
let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

async function deriveKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = await crypto.subtle.sign("HMAC", base, encoder.encode(KEY_CONTEXT));
  return crypto.subtle.importKey(
    "raw",
    derived,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function getKey(secret: string): Promise<CryptoKey> {
  if (!cachedKey || cachedKey.secret !== secret) {
    cachedKey = { secret, key: deriveKey(secret) };
  }
  return cachedKey.key;
}

async function sign(secret: string, payload: string): Promise<Uint8Array> {
  const key = await getKey(secret);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

// ---------- Tokens ----------

/**
 * New session token, valid 30 days from `now`. Returns null when
 * APP_PASSWORD is not set (fail closed).
 */
export async function createSessionToken(now: number = Date.now()): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const payload = `${TOKEN_VERSION}.${Math.floor(now) + SESSION_MAX_AGE_MS}`;
  return `${payload}.${toBase64Url(await sign(secret, payload))}`;
}

const TOKEN_RE = /^v1\.(\d{13,15})\.([A-Za-z0-9_-]{43})$/;

/**
 * True only for a well-formed, unexpired token signed with the current
 * APP_PASSWORD. Never throws: any bad input returns false.
 */
export async function verifySessionToken(
  token: unknown,
  now: number = Date.now(),
): Promise<boolean> {
  try {
    if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
      return false;
    }
    const match = TOKEN_RE.exec(token);
    if (!match) return false;
    const expiresAt = Number(match[1]);
    if (!Number.isSafeInteger(expiresAt)) return false;
    if (expiresAt <= now) return false; // expired
    if (expiresAt > now + SESSION_MAX_AGE_MS + 60_000) return false; // longer than we ever issue
    const secret = getSecret();
    if (!secret) return false;
    // Compare the canonical base64url text, not decoded bytes: the last
    // character of 43 base64url chars has 2 unused bits, so decoding would
    // accept several spellings of one signature.
    const expected = toBase64Url(await sign(secret, `${TOKEN_VERSION}.${match[1]}`));
    return timingSafeEqual(encoder.encode(match[2]), encoder.encode(expected));
  } catch {
    return false;
  }
}

// ---------- Password ----------

/**
 * Compare a typed password with APP_PASSWORD. Both sides are hashed with
 * SHA-256 first, then the equal-length digests are compared in constant
 * time. Unset/empty APP_PASSWORD or empty input => false.
 */
export async function checkPassword(input: unknown): Promise<boolean> {
  const secret = getSecret();
  if (!secret) return false;
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  const [a, b] = await Promise.all([sha256(input), sha256(secret)]);
  return timingSafeEqual(a, b);
}

// ---------- Redirect target ----------

/**
 * Only same-origin relative paths: one leading "/", never "//" or "/\",
 * no scheme, no control characters, no backslashes. Anything else, and
 * /login itself, gives "/today".
 */
export function sanitizeNextPath(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_NEXT_PATH;
  if (raw.length === 0 || raw.length > 2048) return DEFAULT_NEXT_PATH;
  if (!raw.startsWith("/")) return DEFAULT_NEXT_PATH;
  if (raw.startsWith("//")) return DEFAULT_NEXT_PATH;
  if (raw.includes("\\")) return DEFAULT_NEXT_PATH;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_NEXT_PATH;
  // Encoded tricks: "/%2F%2Fevil.com", "/%5Cevil", encoded control chars.
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return DEFAULT_NEXT_PATH;
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return DEFAULT_NEXT_PATH;
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return DEFAULT_NEXT_PATH;
  // Final check: it must resolve to the same origin.
  try {
    const base = "http://same-origin.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return DEFAULT_NEXT_PATH;
    if (url.pathname === "/login" || url.pathname.startsWith("/login/")) {
      return DEFAULT_NEXT_PATH;
    }
    return url.pathname + url.search;
  } catch {
    return DEFAULT_NEXT_PATH;
  }
}

// ---------- Cookie ----------

export type AuthCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

/** httpOnly, secure in production, SameSite=Lax, whole site, 30 days. */
export function authCookieOptions(): AuthCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  };
}

// ---------- Server components / server actions ----------

/** True when the request carries a valid `rr_auth` cookie. */
export async function isAuthenticated(): Promise<boolean> {
  // The expiry check reads the clock. With Cache Components the clock may
  // not be read while prerendering (also runtime prefetches), so wait for
  // the real request first.
  await connection();
  const store = await cookies();
  return verifySessionToken(store.get(AUTH_COOKIE)?.value);
}

export type AuthCheck = { ok: true } | { ok: false; error: string };

/**
 * For server actions: call first, return the result when it is not ok.
 *   const auth = await requireAuth(); if (!auth.ok) return auth;
 */
export async function requireAuth(): Promise<AuthCheck> {
  return (await isAuthenticated()) ? { ok: true } : { ok: false, error: SIGN_IN_AGAIN };
}

/** For server components that read data: redirect to /login when not signed in. */
export async function requireAuthOrRedirect(nextPath: string = DEFAULT_NEXT_PATH): Promise<void> {
  if (!(await isAuthenticated())) {
    redirect(`/login?next=${encodeURIComponent(sanitizeNextPath(nextPath))}`);
  }
}

// ---------- Throttle ----------

// Best effort only. The counter lives in the memory of one server instance.
// On serverless (Vercel) there can be several instances, and each cold start
// begins at zero, so this slows down guessing but is not a hard limit. It is
// global per instance (not per IP), so wrong tries from anyone also lock out
// the right password for a while.
export const THROTTLE_MAX_FAILURES = 5;
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;

export type Throttle = {
  isLocked(now?: number): boolean;
  recordFailure(now?: number): void;
  reset(): void;
};

export function createThrottle(
  maxFailures: number = THROTTLE_MAX_FAILURES,
  windowMs: number = THROTTLE_WINDOW_MS,
): Throttle {
  let failures: number[] = [];
  const prune = (now: number) => {
    failures = failures.filter((t) => now - t < windowMs);
  };
  return {
    isLocked(now = Date.now()) {
      prune(now);
      return failures.length >= maxFailures;
    },
    recordFailure(now = Date.now()) {
      prune(now);
      failures.push(now);
    },
    reset() {
      failures = [];
    },
  };
}

const loginThrottle = createThrottle();

// ---------- Login ----------

export const MIN_FAILURE_DELAY_MS = 400;

export type LoginResult =
  | { ok: true; token: string; cookie: AuthCookieOptions }
  | { ok: false; reason: "wrong" | "locked" };

type LoginDeps = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  throttle?: Throttle;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Check the password and make a session token. A failure always takes at
 * least MIN_FAILURE_DELAY_MS. While locked (5 failures in 15 min on this
 * instance) even the right password is refused.
 */
export async function attemptLogin(password: unknown, deps: LoginDeps = {}): Promise<LoginResult> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const throttle = deps.throttle ?? loginThrottle;
  const started = now();

  const fail = async (reason: "wrong" | "locked"): Promise<LoginResult> => {
    const wait = MIN_FAILURE_DELAY_MS - (now() - started);
    if (wait > 0) await sleep(wait);
    return { ok: false, reason };
  };

  if (throttle.isLocked(started)) return fail("locked");

  // Reserve the attempt BEFORE the first await. Parallel requests all pass
  // through this synchronous step one after the other, so N requests sent at
  // the same time count as N tries and cannot all slip under the limit.
  // A correct password clears the reservations again (reset below).
  throttle.recordFailure(started);

  if (!(await checkPassword(password))) {
    return fail("wrong");
  }
  const token = await createSessionToken(now());
  if (!token) return fail("wrong");
  throttle.reset();
  return { ok: true, token, cookie: authCookieOptions() };
}
