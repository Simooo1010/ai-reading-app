// Fonts for the PRINTED document only (SPEC.md §7.4 "Font"). Imported only by
// components/print/PrintClient.tsx, so Next.js downloads them at build time and
// the browser gets them only on the print page (never on Today, Path or
// Progress). The app's own UI keeps Newsreader (design-system/tokens.css).
// Times New Roman is a system font (font stack in design-system/print.css).

import { Inter, JetBrains_Mono, Lora } from "next/font/google";

/** Modern Sans; also the headings of the Default format. */
export const printSans = Inter({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--rr-print-font-sans",
  display: "swap",
});

/** Classic Serif; also the body text of the Default format. */
export const printSerif = Lora({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--rr-print-font-serif",
  display: "swap",
});

/** Typewriter; the Monospace format and code blocks. Not preloaded: most pages use it only for code. */
export const printMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--rr-print-font-mono",
  display: "swap",
  preload: false,
});

/** Class names that define the three font variables (put on the print page root). */
export const printFontVariables = `${printSans.variable} ${printSerif.variable} ${printMono.variable}`;
