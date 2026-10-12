import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import { APP_GROUND, APP_GROUND_DARK } from "@/lib/app-colors";
import "@/design-system/tokens.css"; // 1. tokens + base
import "@/design-system/components.css"; // 2. rr- classes

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"], // variable font: wght 400-700 + opsz 6-72
  variable: "--font-newsreader", // tokens.css maps this into --rr-font-serif
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Reading",
  description: "What to read next in your AI reading path.",
  // iPhone home screen web app: full screen, own title, status bar on the
  // cream page ("default" = dark text on a light bar). The manifest link and
  // the icon links come from app/manifest.ts, app/icon.tsx, app/apple-icon.tsx.
  appleWebApp: {
    capable: true,
    title: "AI Reading",
    statusBarStyle: "default",
  },
  // Next.js writes only the standard "mobile-web-app-capable"; older iOS
  // versions still read the apple- name.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Light and dark follow the system (tokens.css). The browser / home-screen
  // bar colour follows too. The manifest and the generated icons can only hold
  // one value, so they stay light (app/manifest.ts, lib/app-colors.ts).
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: APP_GROUND }, // = --rr-ground (light)
    { media: "(prefers-color-scheme: dark)", color: APP_GROUND_DARK }, // = --rr-ground (dark)
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={newsreader.variable}>
      <body>{children}</body>
    </html>
  );
}
