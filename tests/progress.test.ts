import { describe, expect, it } from "vitest";
import {
  TARGET_RANGE_ERROR,
  TARGET_STEP_ERROR,
  fillPercent,
  formatStreakDays,
  formatTarget,
  formatWeeklyPace,
  parseStoredTarget,
  parseTargetInput,
  progressData,
} from "@/lib/progress";
import type { Item, Status } from "@/lib/types";

// Test fixtures only (not real Notion content).
let seq = 0;
function item(status: Status, extra: Partial<Item> = {}): Item {
  seq++;
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`,
    title: `Item ${seq}`,
    layer: "1 · Foundations",
    author: "Test Author",
    type: "Essay",
    link: `https://example.com/${seq}`,
    published: null,
    readingTimeMin: 60,
    difficulty: "Easy",
    priority: "Core",
    status,
    whyRead: "",
    foundVia: "",
    pairedWith: [],
    phase: "Phase 1",
    order: seq,
    verified: true,
    addedIn: "Chat 2",
    notes: "",
    doneOn: null,
    ...extra,
  };
}

// 2026-10-10 is a Saturday; its week is Mon 5 Oct … Sun 11 Oct.
const TODAY = "2026-10-10";

describe("progressData", () => {
  it("empty database: zeros everywhere, no NaN, projection finished", () => {
    const d = progressData([], TODAY);
    expect(d.context).toBe("0 of 0 items done");
    expect(d.hours).toEqual({ done: "0", thisWeek: "0", total: "0", percent: 0, fill: 0 });
    expect(d.streak).toEqual({ days: 0, text: "0 days", helper: "Read something today to start" });
    expect(d.projection).toEqual({ kind: "finished" });
    expect(d.core.fill).toBe(0);
    expect(d.core.percent).toBe(0);
    expect(d.core.countText).toBe("0 of 0 items");
    expect(d.weeks).toHaveLength(8);
    expect(JSON.stringify(d)).not.toMatch(/NaN|Infinity/);
  });

  it("zero hours (all reading times empty): no NaN", () => {
    const d = progressData(
      [item("To read", { readingTimeMin: null }), item("Done", { readingTimeMin: null, doneOn: TODAY })],
      TODAY,
    );
    expect(d.hours.fill).toBe(0);
    expect(d.hours.total).toBe("0");
    expect(JSON.stringify(d)).not.toMatch(/NaN|Infinity/);
  });

  it("nothing done: 'none' projection, 0-day streak", () => {
    const d = progressData([item("To read"), item("Reading")], TODAY);
    expect(d.context).toBe("0 of 2 items done");
    expect(d.projection).toEqual({ kind: "none" });
    expect(d.streak.text).toBe("0 days");
  });

  it("skipped items are left out of every number", () => {
    const items = [
      item("Done", { doneOn: "2026-10-09", readingTimeMin: 30 }),
      item("Done", { doneOn: "2026-10-10", readingTimeMin: 45 }),
      item("To read", { readingTimeMin: 90, priority: "Optional" }),
      item("Skipped", { readingTimeMin: 600, priority: "Optional" }),
    ];
    const d = progressData(items, TODAY);
    expect(d.context).toBe("2 of 3 items done");
    expect(d.hours.done).toBe("1.3"); // 75 min = 1.25 h, half up
    expect(d.hours.total).toBe("2.8"); // 165 min = 2.75 h
    expect(d.hours.thisWeek).toBe("1.3");
    expect(d.hours.percent).toBe(45);
    expect(d.hours.fill).toBeCloseTo((75 / 165) * 100, 6);
    expect(d.streak).toEqual({ days: 2, text: "2 days", helper: "since Fri 9 Oct" });
    expect(d.priorities.find((p) => p.priority === "Optional")).toEqual({
      priority: "Optional",
      itemsDone: 0,
      itemsTotal: 1,
    });
    expect(d.core.countText).toBe("2 of 2 items");
    expect(d.core.hoursDone).toBe("1.3");
    expect(d.core.percent).toBe(100);
  });

  it("one-day streak says '1 day'", () => {
    const d = progressData([item("Done", { doneOn: TODAY }), item("To read")], TODAY);
    expect(d.streak.text).toBe("1 day");
    expect(d.streak.helper).toBe("since Sat 10 Oct");
  });

  it("date projection: formatted date and weekly pace", () => {
    // 4 h done in the last 28 days → 1 h a week; 3 h left → 21 days.
    const items = [
      item("Done", { doneOn: "2026-09-20", readingTimeMin: 120 }),
      item("Done", { doneOn: "2026-10-08", readingTimeMin: 120 }),
      item("To read", { readingTimeMin: 180 }),
    ];
    const d = progressData(items, TODAY);
    expect(d.projection).toEqual({
      kind: "date",
      dateText: "31 Oct 2026",
      helper: "at your pace of 1 h a week",
    });
  });

  it("date projection with a very slow pace says minutes, not '0 h'", () => {
    // 10 min done in the last 28 days → 2.5 min a week (0.04 h).
    const items = [item("Done", { doneOn: "2026-10-08", readingTimeMin: 10 }), item("To read", { readingTimeMin: 30 })];
    const d = progressData(items, TODAY);
    expect(d.projection.kind).toBe("date");
    if (d.projection.kind === "date") expect(d.projection.helper).toBe("at your pace of 3 min a week");
  });

  it("finished: nothing left that is not Done or Skipped", () => {
    const d = progressData([item("Done", { doneOn: TODAY }), item("Skipped")], TODAY);
    expect(d.projection).toEqual({ kind: "finished" });
    expect(d.context).toBe("1 of 1 item done");
  });
});

describe("small formatters", () => {
  it("fillPercent never divides by zero and caps at 100", () => {
    expect(fillPercent(0, 0)).toBe(0);
    expect(fillPercent(5, 0)).toBe(0);
    expect(fillPercent(1, 4)).toBe(25);
    expect(fillPercent(9, 4)).toBe(100);
  });

  it("formatStreakDays", () => {
    expect(formatStreakDays(0)).toBe("0 days");
    expect(formatStreakDays(1)).toBe("1 day");
    expect(formatStreakDays(12)).toBe("12 days");
  });

  it("formatWeeklyPace rounds half up from minutes, with the unit", () => {
    // 105 min in 28 days → 26.25 min a week → 0.4375 h → "0.4 h"
    expect(formatWeeklyPace(105 / 60 / 4)).toBe("0.4 h");
    // 630 min → 157.5 min a week = 2.625 h → "2.6 h"
    expect(formatWeeklyPace(630 / 60 / 4)).toBe("2.6 h");
    // 2.55 h a week = 153 min → 25.5 tenths → half up → "2.6 h"
    expect(formatWeeklyPace(2.55)).toBe("2.6 h");
    // 6 min a week is exactly 0.1 h: still hours
    expect(formatWeeklyPace(24 / 60 / 4)).toBe("0.1 h");
    expect(formatWeeklyPace(0.1)).toBe("0.1 h");
    expect(formatWeeklyPace(0)).toBe("0 min");
  });

  it("formatWeeklyPace shows minutes below 0.1 h (QA LOW-1: never '0 h')", () => {
    // 10 min in 28 days → 2.5 min a week = 0.0417 h → "3 min"
    expect(formatWeeklyPace(10 / 60 / 4)).toBe("3 min");
    expect(formatWeeklyPace(0.0417)).toBe("3 min");
    // 5.75 min a week → "6 min" (rounded), still below 0.1 h
    expect(formatWeeklyPace(23 / 60 / 4)).toBe("6 min");
    // A tiny pace never reads "0 min"
    expect(formatWeeklyPace(1 / 60 / 4)).toBe("1 min");
  });
});

describe("weekly target input", () => {
  it("accepts whole and half hours in range, with dot or comma", () => {
    expect(parseTargetInput("8")).toEqual({ ok: true, hours: 8 });
    expect(parseTargetInput(" 4.5 ")).toEqual({ ok: true, hours: 4.5 });
    expect(parseTargetInput("4,5")).toEqual({ ok: true, hours: 4.5 });
    expect(parseTargetInput("0.5")).toEqual({ ok: true, hours: 0.5 });
    expect(parseTargetInput(".5")).toEqual({ ok: true, hours: 0.5 });
    expect(parseTargetInput("40")).toEqual({ ok: true, hours: 40 });
  });

  it("rejects empty, junk and out-of-range values with the range message", () => {
    for (const raw of ["", " ", "abc", "0", "0.4", "40.5", "100", "-1", "1e1", "5h", "Infinity", "NaN", "1.2.3"]) {
      expect(parseTargetInput(raw)).toEqual({ ok: false, error: TARGET_RANGE_ERROR });
    }
    expect(TARGET_RANGE_ERROR).toBe("Enter a number from 0.5 to 40.");
  });

  it("rejects values that are not whole or half hours", () => {
    expect(parseTargetInput("4.3")).toEqual({ ok: false, error: TARGET_STEP_ERROR });
    expect(parseTargetInput("7.25")).toEqual({ ok: false, error: TARGET_STEP_ERROR });
  });

  it("parseStoredTarget falls back to 5 h for anything unusable", () => {
    expect(parseStoredTarget("8")).toBe(8);
    expect(parseStoredTarget("2.5")).toBe(2.5);
    expect(parseStoredTarget(null)).toBe(5);
    expect(parseStoredTarget(undefined)).toBe(5);
    expect(parseStoredTarget("")).toBe(5);
    expect(parseStoredTarget("garbage")).toBe(5);
    expect(parseStoredTarget("0")).toBe(5);
    expect(parseStoredTarget("999")).toBe(5);
  });

  it("formatTarget", () => {
    expect(formatTarget(5)).toBe("5");
    expect(formatTarget(4.5)).toBe("4.5");
  });
});
