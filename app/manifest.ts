import type { MetadataRoute } from "next";

// Web app manifest. The colours are the design-system ground (#FCF3DC):
// a manifest cannot read CSS variables, so the value is repeated here.
// display "browser" keeps the app opening in the normal browser, as before.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Reading",
    short_name: "AI Reading",
    description: "What to read next in your AI reading path.",
    start_url: "/today",
    display: "browser",
    background_color: "#FCF3DC",
    theme_color: "#FCF3DC",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
