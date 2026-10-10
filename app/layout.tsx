import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={newsreader.variable}>
      <body>{children}</body>
    </html>
  );
}
