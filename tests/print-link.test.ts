import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemCard } from "@/components/ItemCard";
import { PrintLink } from "@/components/PrintLink";
import { opensAsPdf } from "@/lib/print/classify";
import { backLink, findItem, printFrom, printHref } from "@/lib/print/screen";

// Fixture ids, titles and links only.
const ID = "0c79d5a9-ee16-4798-81de-b5a23142ebb5";

function html(props: Parameters<typeof PrintLink>[0]): string {
  return renderToStaticMarkup(createElement(PrintLink, props));
}

describe("opensAsPdf", () => {
  it.each([
    ["https://example.com/report.pdf", "https://example.com/report.pdf"],
    [" https://example.com/Report.PDF?x=1 ", "https://example.com/Report.PDF?x=1"],
    ["https://arxiv.org/pdf/2301.12345", "https://arxiv.org/pdf/2301.12345"],
    ["https://arxiv.org/abs/2301.12345", null],
    ["https://arxiv.org/html/2301.12345", null],
    ["https://example.com/post", null],
    ["javascript:x.pdf", null],
    ["", null],
  ])("%j -> %j", (link, out) => {
    expect(opensAsPdf(link)).toBe(out);
  });
});

describe("PrintLink", () => {
  it("text form, web source: 'Print' to the print page, same tab, no prefetch", () => {
    const out = html({ id: ID, title: "Fixture", pdfLink: null, from: "today", variant: "text" });
    expect(out).toContain(`href="/print/${ID}?from=today"`);
    expect(out).toContain(">Print</a>");
    expect(out).toContain('class="rr-print-link"');
    expect(out).toContain('aria-hidden="true"'); // icon is decoration
    expect(out).not.toContain("target=");
    expect(out).not.toMatch(/prefetch/i);
    expect(out.startsWith("<a ")).toBe(true); // a plain link, not next/link
  });

  it("text form, PDF source: 'Open PDF' straight to the PDF in a new tab", () => {
    const out = html({ id: ID, title: "Fixture", pdfLink: "https://example.com/a.pdf", from: "path", variant: "text" });
    expect(out).toContain('href="https://example.com/a.pdf"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("Open PDF");
    expect(out).toContain("(opens in a new tab)");
    expect(out).not.toContain("/print/");
  });

  it("icon form, web source: icon-only link with 'Print <title>'", () => {
    const out = html({ id: ID, title: "A & B", pdfLink: null, from: "path", variant: "icon" });
    expect(out).toBe(`<a class="rr-print-icon" href="/print/${ID}?from=path" aria-label="Print A &amp; B"></a>`);
  });

  it("icon form, PDF source", () => {
    const out = html({ id: ID, title: "Paper", pdfLink: "https://arxiv.org/pdf/2301.12345", from: "path", variant: "icon" });
    expect(out).toContain('aria-label="Open PDF: Paper (opens in a new tab)"');
    expect(out).toContain('href="https://arxiv.org/pdf/2301.12345"');
    expect(out).toContain('target="_blank"');
  });

  it("cover: the print link sits under the actions, outside the cover", () => {
    const out = renderToStaticMarkup(
      createElement(ItemCard, {
        card: {
          id: ID, order: 3, title: "Fixture", author: "", type: "Essay", layer: "1 · Foundations",
          priority: "Core", phase: "Phase 1", status: "To read", difficulty: "Easy", readingTimeMin: 10,
          whyRead: "", link: "https://example.com/a", published: null, scope: null, answers: [],
        },
        size: "hero", titleId: "t", showStatus: false, actions: null, printFrom: "today",
      }),
    );
    const cover = out.slice(out.indexOf("<article"), out.indexOf("</article>"));
    expect(cover).not.toContain("rr-print-icon");
    expect(out).toContain(`href="/print/${ID}?from=today"`);
  });
});

describe("print screen helpers", () => {
  it("printFrom whitelists 'path', everything else is 'today'", () => {
    expect(printFrom("path")).toBe("path");
    expect(printFrom(["path", "today"])).toBe("path");
    for (const v of ["today", undefined, "", "https://evil.example", "/path", "PATH", ["x"]]) expect(printFrom(v)).toBe("today");
  });

  it("backLink", () => {
    expect(backLink("today")).toEqual({ href: "/today", label: "Back to Today" });
    expect(backLink("path")).toEqual({ href: "/path", label: "Back to Path" });
  });

  it("printHref encodes the id", () => {
    expect(printHref(ID, "today")).toBe(`/print/${ID}?from=today`);
    expect(printHref("a/b?c", "path")).toBe("/print/a%2Fb%3Fc?from=path");
  });

  it("findItem ignores dashes and case", () => {
    const items = [{ id: ID }, { id: "11111111-2222-3333-4444-555555555555" }];
    expect(findItem(items, ID.replace(/-/g, ""))).toBe(items[0]);
    expect(findItem(items, ID.toUpperCase())).toBe(items[0]);
    expect(findItem(items, "11111111222233334444555555555555")).toBe(items[1]);
    expect(findItem(items, "99999999-2222-3333-4444-555555555555")).toBeNull();
    expect(findItem([], ID)).toBeNull();
  });
});
