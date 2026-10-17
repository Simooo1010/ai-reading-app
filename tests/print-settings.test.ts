// Print customization: stored values are checked field by field.
import { describe, expect, it } from "vitest";
import {
  clampSettings,
  DEFAULT_SETTINGS,
  FONT_LABELS,
  parseSettings,
  PRINT_FONTS,
  sameSettings,
  serializeSettings,
  SETTINGS_STORAGE_KEY,
} from "@/lib/print/settings";

describe("print settings", () => {
  it("has the SPEC defaults and storage key", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      format: "default",
      font: "default",
      size: 12,
      lineSpacing: 1.6,
      margin: 25,
      excludeEmbeds: false,
      language: "en",
    });
    expect(SETTINGS_STORAGE_KEY).toBe("rr-print-settings-v1");
  });

  it("has the five fonts of SPEC §7.4 with their labels", () => {
    expect(PRINT_FONTS).toEqual(["default", "sans", "serif", "times", "mono"]);
    expect(Object.values(FONT_LABELS)).toEqual(["Format default", "Modern Sans", "Classic Serif", "Times New Roman", "Typewriter"]);
  });

  it("round-trips valid settings", () => {
    const s = { format: "monospace", font: "times", size: 36, lineSpacing: 3, margin: 80, excludeEmbeds: true, language: "it" } as const;
    expect(parseSettings(serializeSettings(s))).toEqual(s);
    expect(parseSettings(s)).toEqual(s);
  });

  it("falls back to defaults for garbage, field by field", () => {
    for (const raw of [null, undefined, "", "not json", "[]", "42", "null", 7, true, [], "{"]) {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
    expect(parseSettings(JSON.stringify({ format: "newspaper", font: "comic", size: "big", lineSpacing: null, margin: {}, excludeEmbeds: "yes", language: "fr" }))).toEqual(
      DEFAULT_SETTINGS,
    );
    expect(parseSettings(JSON.stringify({ font: "serif", size: "x" }))).toEqual({ ...DEFAULT_SETTINGS, font: "serif" });
  });

  it("brings numbers into range", () => {
    expect(clampSettings({ size: 2 }).size).toBe(8);
    expect(clampSettings({ size: 99 }).size).toBe(36);
    expect(clampSettings({ lineSpacing: 0.2 }).lineSpacing).toBe(1);
    expect(clampSettings({ lineSpacing: 9 }).lineSpacing).toBe(3);
    expect(clampSettings({ margin: -10 }).margin).toBe(0);
    expect(clampSettings({ margin: 500 }).margin).toBe(80);
  });

  it("snaps to the steps without float noise", () => {
    expect(clampSettings({ lineSpacing: 1.6000000000000001 }).lineSpacing).toBe(1.6);
    expect(clampSettings({ lineSpacing: 1.04 }).lineSpacing).toBe(1);
    expect(clampSettings({ lineSpacing: 2.25 }).lineSpacing).toBe(2.3);
    expect(clampSettings({ size: 12.4 }).size).toBe(12);
    expect(clampSettings({ margin: 24.6 }).margin).toBe(25);
  });

  it("accepts numbers written as strings, with a comma as decimal mark", () => {
    expect(clampSettings({ size: "14", lineSpacing: "1,8", margin: " 30 " })).toMatchObject({ size: 14, lineSpacing: 1.8, margin: 30 });
  });

  it("refuses NaN and Infinity", () => {
    expect(clampSettings({ size: Number.NaN, margin: Number.POSITIVE_INFINITY })).toMatchObject({ size: 12, margin: 25 });
  });

  it("compares settings", () => {
    expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS })).toBe(true);
    expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, margin: 24 })).toBe(false);
    expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, language: "it" })).toBe(false);
  });

  it("remembers the language: English or Italiano only, English by default", () => {
    expect(parseSettings(JSON.stringify({ language: "it" })).language).toBe("it");
    expect(parseSettings(JSON.stringify({ language: "en" })).language).toBe("en");
    for (const language of ["IT", "italian", "fr", "", 1, null, ["it"], { it: true }]) {
      expect(clampSettings({ language }).language).toBe("en");
    }
    // Settings stored before the language existed still load, in English.
    const old = JSON.stringify({ format: "monospace", font: "mono", size: 14, lineSpacing: 2, margin: 20, excludeEmbeds: true });
    expect(parseSettings(old)).toEqual({ format: "monospace", font: "mono", size: 14, lineSpacing: 2, margin: 20, excludeEmbeds: true, language: "en" });
  });
});
