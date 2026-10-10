import { describe, expect, it } from "vitest";
import { buildStatusUpdate, isPageId, isStatus } from "@/lib/notion";
import type { Status } from "@/lib/types";

describe("buildStatusUpdate", () => {
  it("Done sets Done on to today", () => {
    expect(buildStatusUpdate("Done", "2026-10-10")).toEqual({
      Status: { select: { name: "Done" } },
      "Done on": { date: { start: "2026-10-10" } },
    });
  });

  it.each<Status>(["Reading", "Skipped", "To read"])(
    "%s clears Done on",
    (status) => {
      expect(buildStatusUpdate(status, "2026-10-10")).toEqual({
        Status: { select: { name: status } },
        "Done on": { date: null },
      });
    },
  );

  it("writes only the two properties Status and Done on", () => {
    for (const status of ["To read", "Reading", "Done", "Skipped"] as const) {
      expect(Object.keys(buildStatusUpdate(status, "2026-10-10")).sort()).toEqual(
        ["Done on", "Status"],
      );
    }
  });

  it("rejects an unknown status (Notion would create a new option)", () => {
    expect(() => buildStatusUpdate("done" as Status, "2026-10-10")).toThrow(
      /Unknown status/,
    );
    expect(() => buildStatusUpdate("Archived" as Status, "2026-10-10")).toThrow();
  });

  it("rejects a bad date for Done", () => {
    expect(() => buildStatusUpdate("Done", "10/10/2026")).toThrow(/Bad date/);
    expect(() => buildStatusUpdate("Done", "")).toThrow(/Bad date/);
  });
});

describe("input checks", () => {
  it("isStatus accepts only the 4 exact labels", () => {
    expect(isStatus("To read")).toBe(true);
    expect(isStatus("Reading")).toBe(true);
    expect(isStatus("Done")).toBe(true);
    expect(isStatus("Skipped")).toBe(true);
    expect(isStatus("to read")).toBe(false);
    expect(isStatus("")).toBe(false);
    expect(isStatus(undefined)).toBe(false);
  });

  it("isPageId accepts Notion ids only", () => {
    expect(isPageId("0c79d5a9-ee16-4798-81de-b5a23142ebb5")).toBe(true);
    expect(isPageId("0c79d5a9ee16479881deb5a23142ebb5")).toBe(true);
    expect(isPageId("")).toBe(false);
    expect(isPageId("../secret")).toBe(false);
    expect(isPageId(42)).toBe(false);
  });
});
