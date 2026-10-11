import type { MetadataRoute } from "next";
import { APP_GROUND } from "@/lib/app-colors";
import { APP_ICONS, appIconUrl } from "@/lib/app-icons";

// Web app manifest (/manifest.webmanifest). Added to the iPhone home screen,
// the app opens full screen at Today, and every page of the site ("/") stays
// inside the app (no Safari address bar). Public in proxy.ts.

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AI Reading",
    short_name: "AI Reading",
    description: "What to read next in your AI reading path.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: APP_GROUND,
    theme_color: APP_GROUND,
    icons: APP_ICONS.map((icon) => ({
      src: appIconUrl(icon.id),
      sizes: `${icon.size}x${icon.size}`,
      type: "image/png",
      purpose: icon.purpose,
    })),
  };
}
