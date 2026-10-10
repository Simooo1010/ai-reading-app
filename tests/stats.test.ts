import { describe, expect, it } from "vitest";
import {
  addDays,
  coreCompletion,
  dateOnly,
  daysBetween,
  doneByPriority,
  formatDateLong,
  formatDayShort,
  formatHours,
  hoursByLayer,
  mondayOf,
  percent,
  projectedFinish,
  roundHours1,
  streak,
  summary,
  weeklyHours,
} from "@/lib/stats";
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
const done = (doneOn: string | null, min: number | null = 60, extra: Partial<Item> = {}) =>
  item("Done", { doneOn, readingTimeMin: min, ...extra });

// 2026-10-10 is a Saturday; its week is Mon 5 Oct … Sun 11 Oct.
const TODAY = "2026-10-10";

describe("date helpers", () => {
  it("mondayOf: Monday maps to itself, Sunday to the Monday before", () => {
    expect(mondayOf("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(mondayOf("2026-10-10")).toBe("2026-10-05"); // Saturday
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(mondayOf("2026-10-12")).toBe("2026-10-12"); // next Monday
  });

  it("mondayOf across a year boundary", () => {
    // Fri 1 Jan 2027 belongs to the week of Mon 28 Dec 2026.
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    expect(mondayOf("2027-01-03")).toBe("2026-12-28"); // Sunday
    expect(mondayOf("2027-01-04")).toBe("2027-01-04");
  });

  it("addDays / daysBetween ignore DST changes (Europe: 25 Oct 2026)", () => {
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(daysBetween("2026-10-01", "2026-11-01")).toBe(31);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("dateOnly keeps the first 10 characters and rejects junk", () => {
    expect(dateOnly("2026-10-09")).toBe("2026-10-09");
    expect(dateOnly("2026-10-09T23:30:00.000+02:00")).toBe("2026-10-09");
    expect(dateOnly(null)).toBeNull();
    expect(dateOnly("")).toBeNull();
    expect(dateOnly("09/10/2026")).toBeNull();
    expect(dateOnly("2026-02-30")).toBeNull();
  });

  it("formats dates in fixed English", () => {
    expect(formatDayShort("2026-10-09")).toBe("Fri 9 Oct");
    expect(formatDayShort("2027-01-03")).toBe("Sun 3 Jan");
    expect(formatDateLong("2027-03-12")).toBe("12 Mar 2027");
    expect(formatDateLong("2026-12-31")).toBe("31 Dec 2026");
  });
});

describe("hours rounding", () => {
  it("rounds half up from integer minutes", () => {
    // 5355 min = 89.25 h → 89.3 (SPEC snapshot text says ~89.2, truncated)
    expect(roundHours1(5355)).toBe(89.3);
    // 315 min = 5.25 h → 5.3 (SPEC says 5.2)
    expect(roundHours1(315)).toBe(5.3);
    expect(roundHours1(0)).toBe(0);
    expect(roundHours1(2)).toBe(0); // 0.033 h
    expect(roundHours1(3)).toBe(0.1); // 0.05 h, half up
    expect(roundHours1(52)).toBe(0.9); // 0.8667 h
  });

  it("formats without a trailing .0", () => {
    expect(formatHours(120)).toBe("2");
    expect(formatHours(5355)).toBe("89.3");
    expect(formatHours(0)).toBe("0");
  });

  it("percent never shows 100 or 0 by rounding alone", () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(0, 100)).toBe(0);
    expect(percent(1, 1000)).toBe(1);
    expect(percent(999, 1000)).toBe(99);
    expect(percent(1000, 1000)).toBe(100);
    expect(percent(1, 3)).toBe(33);
    expect(percent(1, 2)).toBe(50);
  });
});

describe("summary", () => {
  it("counts totals, excludes Skipped everywhere, sums minutes before dividing", () => {
    const items = [
      done("2026-10-06", 30), // this week
      done("2026-09-30", 45), // last week
      done(null, 15), // Done, no date: in totals only
      item("To read", { readingTimeMin: 90 }),
      item("Reading", { readingTimeMin: null }),
      item("Skipped", { readingTimeMin: 600 }),
      item("Skipped", { readingTimeMin: null }),
    ];
    const s = summary(items, TODAY);
    expect(s.itemsDone).toBe(3);
    expect(s.itemsTotal).toBe(5);
    expect(s.minutesDone).toBe(90);
    expect(s.minutesTotal).toBe(180);
    expect(s.hoursDone).toBe(1.5);
    expect(s.hoursTotal).toBe(3);
    expect(s.percentHours).toBe(50);
    expect(s.minutesThisWeek).toBe(30);
    expect(s.hoursThisWeek).toBe(0.5);
    expect(s.skippedCount).toBe(2);
    expect(s.missingTime).toBe(1); // the Skipped one is not counted
    expect(s.doneWithoutDate).toBe(1);
  });

  it("this week runs Monday to Sunday", () => {
    const items = [
      done("2026-10-04", 10), // Sunday before: last week
      done("2026-10-05", 20), // Monday: this week
      done("2026-10-11", 40), // Sunday: this week
      done("2026-10-12", 80), // next Monday: not this week
    ];
    expect(summary(items, TODAY).minutesThisWeek).toBe(60);
    // On a Monday, the Sunday before is already last week.
    expect(summary(items, "2026-10-12").minutesThisWeek).toBe(80);
    // On a Sunday, the Monday 6 days earlier still counts.
    expect(summary(items, "2026-10-11").minutesThisWeek).toBe(60);
  });

  it("is all zero for no items (no division by zero)", () => {
    const s = summary([], TODAY);
    expect(s).toMatchObject({ itemsTotal: 0, hoursTotal: 0, percentHours: 0 });
  });

  it("does not drift with many small items", () => {
    const items = Array.from({ length: 30 }, () => done("2026-10-06", 7));
    const s = summary(items, TODAY);
    expect(s.minutesDone).toBe(210);
    expect(s.hoursDone).toBe(3.5);
  });
});

describe("weeklyHours", () => {
  it("returns n weeks oldest first, the current week last", () => {
    const weeks = weeklyHours([], TODAY);
    expect(weeks).toHaveLength(8);
    expect(weeks[0].weekStart).toBe("2026-08-17");
    expect(weeks[7].weekStart).toBe("2026-10-05");
    expect(weeks.map((w) => w.isCurrent)).toEqual([
      false, false, false, false, false, false, false, true,
    ]);
    expect(weeklyHours([], TODAY, 3).map((w) => w.weekStart)).toEqual([
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
    ]);
  });

  it("puts each item in the week of its Done on (edges included)", () => {
    const items = [
      done("2026-09-28", 30), // Monday, week 7
      done("2026-10-04", 60), // Sunday, week 7
      done("2026-10-05", 90), // Monday, week 8
      done("2026-08-17", 6), // first day of the oldest week
      done("2026-08-16", 600), // Sunday before: out of range
      done("2026-10-12", 600), // next week: out of range
      done(null, 600), // no date: not in weeks
      item("Skipped", { doneOn: "2026-10-06" }),
      item("To read", { doneOn: "2026-10-06" }), // stale date, not Done
      done("2026-10-06T10:00:00.000+02:00", 12), // time part → that day
    ];
    const weeks = weeklyHours(items, TODAY);
    expect(weeks.map((w) => w.minutes)).toEqual([6, 0, 0, 0, 0, 0, 90, 102]);
    expect(weeks[7].hours).toBe(1.7);
    expect(weeks[6].hours).toBe(1.5);
  });

  it("works across a year boundary", () => {
    const items = [done("2026-12-31", 60), done("2027-01-03", 30), done("2027-01-04", 15)];
    const weeks = weeklyHours(items, "2027-01-05", 2);
    expect(weeks.map((w) => [w.weekStart, w.minutes])).toEqual([
      ["2026-12-28", 90],
      ["2027-01-04", 15],
    ]);
  });
});

describe("hoursByLayer / doneByPriority / coreCompletion", () => {
  const items = [
    done("2026-10-01", 30, { layer: "1 · Foundations", priority: "Core" }),
    item("To read", { layer: "1 · Foundations", priority: "Core", readingTimeMin: 90 }),
    item("Skipped", { layer: "1 · Foundations", priority: "Core", readingTimeMin: 500 }),
    done(null, 60, { layer: "3 · Species", priority: "Optional" }),
    item("Reading", { layer: "3 · Species", priority: "Recommended", readingTimeMin: 20 }),
    item("Skipped", { layer: "5 · Counterweights", priority: "Optional" }),
  ];

  it("lists all 5 layers in order, Skipped left out", () => {
    const rows = hoursByLayer(items);
    expect(rows.map((r) => r.layer)).toEqual([
      "1 · Foundations",
      "2 · Leaders",
      "3 · Species",
      "4 · Frontier essays",
      "5 · Counterweights",
    ]);
    expect(rows[0]).toMatchObject({ itemsDone: 1, itemsTotal: 2, minutesDone: 30, minutesTotal: 120, hoursTotal: 2 });
    expect(rows[1]).toMatchObject({ itemsDone: 0, itemsTotal: 0, hoursDone: 0, hoursTotal: 0 });
    expect(rows[2]).toMatchObject({ itemsDone: 1, itemsTotal: 2, minutesDone: 60, minutesTotal: 80 });
    expect(rows[4]).toMatchObject({ itemsDone: 0, itemsTotal: 0 });
  });

  it("counts Done items per priority in Core / Recommended / Optional order", () => {
    expect(doneByPriority(items)).toEqual([
      { priority: "Core", itemsDone: 1, itemsTotal: 2 },
      { priority: "Recommended", itemsDone: 0, itemsTotal: 1 },
      { priority: "Optional", itemsDone: 1, itemsTotal: 1 },
    ]);
  });

  it("Core completion uses hours, Skipped left out", () => {
    const c = coreCompletion(items);
    expect(c).toMatchObject({ itemsDone: 1, itemsTotal: 2, hoursDone: 0.5, hoursTotal: 2, percentHours: 25 });
    expect(coreCompletion([]).percentHours).toBe(0);
  });
});

describe("streak", () => {
  it("is 0 with no dated Done item", () => {
    expect(streak([done(null), item("To read")], TODAY)).toEqual({ days: 0, sinceDate: null });
  });

  it("counts today only", () => {
    expect(streak([done(TODAY)], TODAY)).toEqual({ days: 1, sinceDate: TODAY });
  });

  it("keeps a streak that ends yesterday (today is not over)", () => {
    const items = [done("2026-10-09"), done("2026-10-08")];
    expect(streak(items, TODAY)).toEqual({ days: 2, sinceDate: "2026-10-08" });
    expect(formatDayShort("2026-10-08")).toBe("Thu 8 Oct");
  });

  it("is broken when the last Done day is two days ago", () => {
    expect(streak([done("2026-10-08"), done("2026-10-07")], TODAY).days).toBe(0);
  });

  it("stops at a gap and counts several items on one day once", () => {
    const items = [
      done("2026-10-10"),
      done("2026-10-10"),
      done("2026-10-09"),
      done("2026-10-07"), // gap on the 8th
      done("2026-10-06"),
    ];
    expect(streak(items, TODAY)).toEqual({ days: 2, sinceDate: "2026-10-09" });
  });

  it("ignores Skipped and not-Done items, and future dates", () => {
    const items = [
      item("Skipped", { doneOn: TODAY }),
      item("Reading", { doneOn: "2026-10-09" }),
      done("2026-10-11"),
    ];
    expect(streak(items, TODAY).days).toBe(0);
  });

  it("runs across a year boundary", () => {
    const items = [done("2026-12-30"), done("2026-12-31"), done("2027-01-01")];
    expect(streak(items, "2027-01-02")).toEqual({ days: 3, sinceDate: "2026-12-30" });
  });
});

describe("projectedFinish", () => {
  it("is 'finished' when nothing is left (Skipped do not count as left)", () => {
    const items = [done(null, 60), item("Skipped", { readingTimeMin: 600 })];
    expect(projectedFinish(items, TODAY)).toEqual({ kind: "finished" });
  });

  it("is 'none' when no hours were read in the last 28 days", () => {
    const items = [
      done("2026-09-12", 600), // today-28: just outside the window
      done(null, 600), // no date: not in the pace
      item("To read", { readingTimeMin: 120 }),
    ];
    expect(projectedFinish(items, TODAY)).toEqual({ kind: "none", remainingHours: 2 });
  });

  it("uses today-27 … today inclusive, divided by 4", () => {
    const items = [
      done("2026-09-13", 120), // today-27: inside
      done(TODAY, 120), // today: inside
      done("2026-09-12", 6000), // today-28: outside
      done("2026-10-11", 6000), // tomorrow: outside
      item("To read", { readingTimeMin: 600 }),
      item("Reading", { readingTimeMin: 120 }),
      item("Skipped", { readingTimeMin: 6000 }),
    ];
    const p = projectedFinish(items, TODAY);
    // 240 min in 28 days → 1 h per week; 12 h left → 84 days.
    expect(p).toEqual({
      kind: "date",
      date: "2027-01-02",
      days: 84,
      weeklyAverage: 1,
      remainingHours: 12,
    });
  });

  it("rounds the days up", () => {
    // 4 h in 28 days = 1 h/week; 61 min left → 7.1167 days → 8.
    const items = [done("2026-10-01", 240), item("To read", { readingTimeMin: 61 })];
    const p = projectedFinish(items, TODAY);
    expect(p.kind === "date" && p.days).toBe(8);
    expect(p.kind === "date" && p.date).toBe("2026-10-18");
  });

  it("gives a date that formats as '12 Mar 2027'", () => {
    // 7 h per week (1680 min / 28 days = 1 h/day); 153 days of reading left.
    const items = [done("2026-10-01", 1680), item("To read", { readingTimeMin: 153 * 60 })];
    const p = projectedFinish(items, TODAY);
    expect(p.kind).toBe("date");
    if (p.kind === "date") {
      expect(p.weeklyAverage).toBe(7);
      expect(formatDateLong(p.date)).toBe("12 Mar 2027");
    }
  });
});
