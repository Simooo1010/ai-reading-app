import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import type { PrintItemInput, PrintLoad } from "@/lib/print/load";
import { LOADER_FAILED_MESSAGE, loadPrintableSafe } from "@/lib/print/safe-load";

const ITEM: PrintItemInput = {
  id: "00000000-0000-0000-0000-000000000001",
  title: "Fixture item",
  author: "Fixture author",
  link: "https://example.com/post",
  readingTimeMin: 5,
};

describe("loadPrintableSafe", () => {
  it("returns the loader result when all is well", async () => {
    const ok: PrintLoad = { kind: "error", message: "fixture", openUrl: ITEM.link, code: "x" };
    const load = vi.fn(async () => ok);
    await expect(loadPrintableSafe(ITEM, { importLoader: async () => load, log: () => {} })).resolves.toBe(ok);
    expect(load).toHaveBeenCalledWith(ITEM);
  });

  it("gives the error message, not a throw, when the loader module cannot load", async () => {
    const log = vi.fn();
    const err = new Error("Failed to load external module jsdom: ERR_REQUIRE_ESM");
    const out = await loadPrintableSafe(ITEM, { importLoader: async () => Promise.reject(err), log });
    expect(out).toEqual({ kind: "error", message: LOADER_FAILED_MESSAGE, openUrl: "https://example.com/post", code: "loader-failed" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("print: loader failed: Error: Failed to load external module jsdom");
  });

  it("gives the error message when the loader itself throws", async () => {
    const out = await loadPrintableSafe(ITEM, {
      importLoader: async () => async () => {
        throw new TypeError("boom");
      },
      log: () => {},
    });
    expect(out.kind).toBe("error");
    if (out.kind === "error") expect(out.message).toBe(LOADER_FAILED_MESSAGE);
  });

  it("offers no Open source link for a bad link", async () => {
    const out = await loadPrintableSafe(
      { ...ITEM, link: "javascript:alert(1)" },
      { importLoader: async () => Promise.reject(new Error("x")), log: () => {} },
    );
    expect(out).toMatchObject({ kind: "error", openUrl: "" });
  });

  it("the default import loads the real loader", async () => {
    const out = await loadPrintableSafe({ ...ITEM, link: "" }, { log: () => {} });
    expect(out).toMatchObject({ kind: "error", code: "bad-url" });
  });
});

// Vercel's Node runtime does not allow require() of ES modules, and Next loads
// jsdom with a real require() (it is a server external package). jsdom 27+
// pulls in ESM-only packages (@exodus/bytes, @csstools/css-calc), so it crashed
// on Vercel. This check fails if an upgrade brings that back.
describe("jsdom loads without require(esm)", () => {
  it("require('jsdom') works with --no-experimental-require-module", () => {
    const script =
      "const { JSDOM, VirtualConsole } = require('jsdom');" +
      "const d = new JSDOM('<p style=\"color: rgb(1 2 3)\">ok</p>', { url: 'https://example.com/', virtualConsole: new VirtualConsole() });" +
      "const p = d.window.document.querySelector('p');" +
      "process.stdout.write(p.textContent + ' ' + d.window.getComputedStyle(p).color);";
    const out = execFileSync(process.execPath, ["--no-experimental-require-module", "-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(out).toBe("ok rgb(1, 2, 3)");
  });
});
