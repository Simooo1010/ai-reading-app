import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // "/" goes straight to Today in one hop (redirects run before proxy.ts).
  // Not permanent, so browsers never cache it. app/page.tsx stays as a fallback.
  async redirects() {
    return [{ source: "/", destination: "/today", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Nobody may show this app in a frame (clickjacking).
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Third-party images in printouts get no referrer.
          { key: "Referrer-Policy", value: "no-referrer" },
          // Private single-user app: keep it out of search engines.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
