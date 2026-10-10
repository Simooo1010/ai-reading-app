// Password gate (SPEC §8). Next.js 16 renamed the `middleware` file
// convention to `proxy` (node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/proxy.md); it runs on the Node.js runtime by default.
//
// Every request except /login and static files needs a valid `rr_auth`
// cookie. Server actions are POSTs to the page URL, so they pass through
// here too; they also check auth themselves (defense in depth).

import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  DEFAULT_NEXT_PATH,
  LOGIN_NEXT_HEADER,
  sanitizeNextPath,
  verifySessionToken,
} from "@/lib/auth";

/** Paths that never need the cookie (the login screen and static assets). */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

function loginUrl(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  const target = sanitizeNextPath(request.nextUrl.pathname + request.nextUrl.search);
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", target);
  return url;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const authed = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

  if (pathname === "/login") {
    // Signed in already: go to Today. Only for page loads; the login form
    // POST still reaches its server action.
    if (authed && (method === "GET" || method === "HEAD")) {
      const url = request.nextUrl.clone();
      url.pathname = DEFAULT_NEXT_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }
    // Hand the sanitized `next` to the login action (see LOGIN_NEXT_HEADER).
    // The form posts to the same URL, so the action sees the same query.
    const headers = new Headers(request.headers);
    headers.delete(LOGIN_NEXT_HEADER);
    headers.set(LOGIN_NEXT_HEADER, sanitizeNextPath(request.nextUrl.searchParams.get("next")));
    return NextResponse.next({ request: { headers } });
  }

  if (isPublicPath(pathname) || authed) return NextResponse.next();

  const target = loginUrl(request);

  if (method === "GET" || method === "HEAD") {
    return NextResponse.redirect(target);
  }

  // Not signed in and not a page load: never run the request.
  if (request.headers.has("next-action")) {
    // Server action called from the page (fetch). 401 with an empty
    // text/plain body plus `x-action-redirect` makes the Next.js client do a
    // full navigation to /login instead of running the action.
    return new NextResponse(null, {
      status: 401,
      headers: {
        "content-type": "text/plain",
        "x-action-redirect": `${target.pathname}${target.search};replace`,
        "cache-control": "no-store",
      },
    });
  }
  // Plain form POST (e.g. without JavaScript): 303 turns it into a GET of /login.
  return NextResponse.redirect(target, 303);
}

export const config = {
  matcher: [
    // Everything except Next.js static files, image optimisation and
    // common metadata files. Other static files are let through by
    // isPublicPath() above.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
