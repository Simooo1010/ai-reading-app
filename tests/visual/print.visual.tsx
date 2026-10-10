// Print screen fixture harness: builds REAL PrintResults from the saved pages
// in tests/fixtures/print (extractPrintable, no network) and renders
// <PrintClient/> to static HTML with the design-system CSS and print.css.
// Writes nothing to Notion; fixtures only.
//
// Run: npx vitest run --config tests/visual/vitest.config.mts
// Output: $VISUAL_OUT or tests/visual/out/ (git-ignored):
//   print-<name>.html  server render (chrome, status, check line; the pages
//                      are built by the browser, so this is the state before
//                      JavaScript runs)
//   print-<name>.json  the PrintResult the page received
//
// The browser part (packing, the real pages, page.pdf) needs JavaScript and
// the real Next.js fonts; it was checked with Playwright against `next start`
// (see the step 6b report), not from these static files.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import PrintClient from "@/components/print/PrintClient";
import { buildPrintResult, PRINT_FIXTURES } from "./print-fixtures";

const ROOT = resolve(__dirname, "../..");
const OUT = process.env.VISUAL_OUT ?? resolve(__dirname, "out");

const EXPECTED_STATUS: Record<string, string[]> = {
  "81-titotal": ["ok", "warning"],
  "157-hyperdimensional": ["ok", "warning"],
  "10-helentoner": ["ok", "warning"],
  "125-joecarlsmith": ["ok", "warning"],
  "16-arxiv-html": ["ok", "warning"],
  "151-lexfridman": ["ok", "warning"],
  paywalled: ["paywalled"],
  "too-short": ["too-short"],
  blocked: ["blocked"],
  failed: ["failed"],
};

it("renders the print screen for every fixture", () => {
  mkdirSync(OUT, { recursive: true });
  for (const f of PRINT_FIXTURES) {
    const result = buildPrintResult(f);
    expect(EXPECTED_STATUS[f.name], f.name).toContain(result.status);
    const body = renderToStaticMarkup(<PrintClient item={f.item} result={result} backHref="/today" />);
    const printable = result.status !== "blocked" && result.status !== "failed" && !!result.document?.elements.length;
    // Print button only when there is something to print; never for blocked/failed.
    expect(body.includes("Print / Save as PDF") || body.includes("Print what we found"), f.name).toBe(printable);
    if (result.status === "paywalled" || result.status === "too-short") {
      if (printable) expect(body).toContain("Print what we found");
    }
    // Every status that is not a clean "ok" offers the source.
    if (result.status !== "ok" && result.status !== "warning") expect(body, f.name).toContain("Open source");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Fixture: print ${f.name}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&family=Inter:ital,wght@0,400..700;1,400..700&family=Lora:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:ital,wght@0,400..700;1,400..700&display=swap">
<link rel="stylesheet" href="file://${ROOT}/design-system/tokens.css">
<link rel="stylesheet" href="file://${ROOT}/design-system/components.css">
<link rel="stylesheet" href="file://${ROOT}/design-system/print.css">
</head><body>${body}</body></html>`;
    writeFileSync(`${OUT}/print-${f.name}.html`, html);
    writeFileSync(`${OUT}/print-${f.name}.json`, JSON.stringify(result, null, 1));
  }
}, 120_000);
