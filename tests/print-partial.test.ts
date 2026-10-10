import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrintBlock, type BlockSpec, type ImageActions } from "@/components/print/PrintBlocks";
import type { PrintDocument } from "@/lib/print/types";

const doc: PrintDocument = {
  url: "https://example.com/post",
  title: "A post",
  subtitle: "",
  author: "Someone",
  publication: "",
  date: "2026-10-01",
  elements: [],
};
const actions: ImageActions = { interactive: false, failed: new Set() };
const traits = { keepWithNext: false, breakable: false, atomic: true };

function html(block: BlockSpec): string {
  return renderToStaticMarkup(createElement(PrintBlock, { block, actions }));
}

describe("partial printout is marked on the paper itself", () => {
  const note = "Only part of this post is public. The rest is for paid readers.";

  it("header and footer carry the note", () => {
    const head = html({ id: "head", kind: "head", doc, fallbackTitle: "t", fallbackAuthor: "a", partialNote: note, traits });
    const foot = html({ id: "foot", kind: "foot", doc, fallbackTitle: "t", fallbackAuthor: "a", fallbackUrl: "u", partialNote: note, traits });
    for (const out of [head, foot]) {
      expect(out).toContain("Partial printout.");
      expect(out).toContain(note);
    }
  });

  it("a normal printout has no note", () => {
    const head = html({ id: "head", kind: "head", doc, fallbackTitle: "t", fallbackAuthor: "a", traits });
    const foot = html({ id: "foot", kind: "foot", doc, fallbackTitle: "t", fallbackAuthor: "a", fallbackUrl: "u", traits });
    expect(head).not.toContain("Partial printout");
    expect(foot).not.toContain("Partial printout");
  });
});
