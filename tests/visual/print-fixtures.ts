// Print screen fixtures: REAL PrintResults built by running extractPrintable
// on the saved pages in tests/fixtures/print (fixtures only, never shown in
// the app). Used by tests/visual/print.visual.tsx. Server/test side only.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractPrintable, type ExtractOptions } from "@/lib/print/extract";
import type { PrintResult } from "@/lib/print/types";
import type { PrintItemInfo } from "@/components/print/PrintClient";

export interface PrintFixture {
  name: string;
  file: string;
  url: string;
  item: PrintItemInfo;
  opts?: ExtractOptions;
  why: string;
}

// Run from the repository root (npx vitest / next start both do).
const DIR = resolve(process.cwd(), "tests/fixtures/print");

function item(id: string, title: string, author: string, link: string): PrintItemInfo {
  return { id: `fixture-${id}`, title, author, link, readingTimeMin: null };
}

export const PRINT_FIXTURES: PrintFixture[] = [
  {
    name: "81-titotal",
    file: "81-titotal.substack.com.html",
    url: "https://titotal.substack.com/p/a-deep-critique-of-ai-2027s-bad-timeline",
    item: item("81", "A deep critique of AI 2027's bad timeline models", "titotal", "https://titotal.substack.com/p/a-deep-critique-of-ai-2027s-bad-timeline"),
    why: "Substack, 12k words, many images, footnotes",
  },
  {
    name: "157-hyperdimensional",
    file: "157-www.hyperdimensional.co.html",
    url: "https://www.hyperdimensional.co/p/among-the-agents",
    item: item("157", "Among the Agents", "Dean W. Ball", "https://www.hyperdimensional.co/p/among-the-agents"),
    why: "Substack custom domain with code blocks",
  },
  {
    name: "10-helentoner",
    file: "10-helentoner.substack.com.html",
    url: "https://helentoner.substack.com/p/unresolved-debates-about-the-future",
    item: item("10", "Unresolved debates about the future of AI", "Helen Toner", "https://helentoner.substack.com/p/unresolved-debates-about-the-future"),
    why: "Substack with a YouTube embed",
  },
  {
    name: "125-joecarlsmith",
    file: "125-joecarlsmith.com.html",
    url: "https://joecarlsmith.com/2024/12/18/takes-on-alignment-faking-in-large-language-models/",
    item: item("125", 'Takes on "Alignment Faking in Large Language Models"', "Joe Carlsmith", "https://joecarlsmith.com/2024/12/18/takes-on-alignment-faking-in-large-language-models/"),
    why: "Long essay (20k words), generic path",
  },
  {
    name: "16-arxiv-html",
    file: "16-arxiv.org-html.html",
    url: "https://arxiv.org/html/1706.03762",
    item: item("16", "Attention Is All You Need", "Ashish Vaswani et al.", "https://arxiv.org/abs/1706.03762"),
    opts: { source: "arxiv-html" },
    why: "arXiv HTML paper: MathML, figures, tables",
  },
  {
    name: "151-lexfridman",
    file: "151-lexfridman.com.html",
    url: "https://lexfridman.com/demis-hassabis-2-transcript",
    item: item("151", "Demis Hassabis: Future of AI, Simulating Reality, Physics and Video Games", "Lex Fridman", "https://lexfridman.com/demis-hassabis-2-transcript"),
    why: "27k-word transcript (packing time)",
  },
  {
    name: "paywalled",
    file: "handmade-substack-paywalled.html",
    url: "https://example.substack.com/p/paid-post",
    item: item("pw", "(HAND-MADE) A Paid Post", "Fixture Author", "https://example.substack.com/p/paid-post"),
    why: "HAND-MADE paywalled Substack post",
  },
  {
    name: "too-short",
    file: "15-papers.nips.cc.html",
    url: "https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html",
    item: item("15", "ImageNet Classification with Deep Convolutional Neural Networks", "Alex Krizhevsky et al.", "https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html"),
    why: "Abstract-only page: too-short",
  },
  {
    name: "blocked",
    file: "14-academic.oup.com.html",
    url: "https://academic.oup.com/mind/article/LIX/236/433/986238",
    item: item("14", "Computing Machinery and Intelligence", "Alan Turing", "https://academic.oup.com/mind/article/LIX/236/433/986238"),
    opts: { httpStatus: 403 },
    why: "Cloudflare challenge: blocked",
  },
  {
    name: "failed",
    file: "handmade-empty.html",
    url: "https://example.com/empty",
    item: item("empty", "(HAND-MADE) Empty page", "Fixture Author", "https://example.com/empty"),
    why: "HAND-MADE empty page: failed",
  },
];

export function fixtureByName(name: string): PrintFixture | undefined {
  return PRINT_FIXTURES.find((f) => f.name === name);
}

/** The real PrintResult of a fixture (extractPrintable on the saved page). */
export function buildPrintResult(f: PrintFixture): PrintResult {
  const html = readFileSync(resolve(DIR, f.file), "utf8");
  // JSON round trip: exactly what a server page sends to the client component.
  return JSON.parse(JSON.stringify(extractPrintable(html, f.url, f.opts))) as PrintResult;
}
