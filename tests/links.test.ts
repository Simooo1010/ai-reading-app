import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "@/lib/links";

describe("safeHttpUrl (hrefs from Notion links)", () => {
  it.each([
    ["https://example.com/a", "https://example.com/a"],
    ["  http://example.com/a?b=1#c  ", "http://example.com/a?b=1#c"],
    ["HTTPS://Example.com", "https://example.com/"],
    ["", null],
    ["   ", null],
    ["javascript:alert(1)", null],
    ["  JavaScript:alert(1)", null],
    ["data:text/html,<script>alert(1)</script>", null],
    ["vbscript:msgbox(1)", null],
    ["ftp://example.com/a", null],
    ["file:///etc/passwd", null],
    ["mailto:a@example.com", null],
    ["https://user:pw@example.com/", null],
    ["/today", null],
    ["//evil.example/x", null],
    ["not a url", null],
  ])("%j -> %j", (input, out) => {
    expect(safeHttpUrl(input)).toBe(out);
  });

  it("non-strings are rejected", () => {
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(42)).toBeNull();
  });
});
