import { describe, expect, it } from "vitest";
import {
  formatMinutes,
  pairedTitles,
  pickNext,
  pickUpcoming,
  readScope,
  todayInRome,
} from "@/lib/today";
import type { Item, Status } from "@/lib/types";

// Test fixtures only (not real Notion content).
function item(order: number, status: Status, extra: Partial<Item> = {}): Item {
  return {
    id: `00000000-0000-0000-0000-${String(order).padStart(12, "0")}`,
    title: `Item ${order}`,
    layer: "1 · Foundations",
    author: "Test Author",
    type: "Essay",
    link: `https://example.com/${order}`,
    published: null,
    readingTimeMin: 10,
    difficulty: "Easy",
    priority: "Core",
    status,
    whyRead: "",
    foundVia: "",
    pairedWith: [],
    phase: "Phase 1",
    order,
    verified: true,
    addedIn: "Chat 2",
    notes: "",
    doneOn: null,
    ...extra,
  };
}

describe("pickNext", () => {
  it("picks the lowest Order among Reading / To read", () => {
    const items = [
      item(1, "Done"),
      item(2, "Skipped"),
      item(4, "To read"),
      item(3, "To read"),
    ];
    expect(pickNext(items)?.order).toBe(3);
  });

  it("picks a Reading item when it is lowest, without reordering", () => {
    const items = [item(5, "To read"), item(2, "Reading"), item(1, "Done")];
    expect(pickNext(items)?.order).toBe(2);
  });

  it("keeps a lower To read item before a later Reading item", () => {
    const items = [item(9, "Reading"), item(4, "To read")];
    expect(pickNext(items)?.order).toBe(4);
  });

  it("returns null when nothing is left", () => {
    expect(pickNext([item(1, "Done"), item(2, "Skipped")])).toBeNull();
    expect(pickNext([])).toBeNull();
  });
});

describe("pickUpcoming", () => {
  const items = [
    item(6, "To read"),
    item(1, "Done"),
    item(2, "Reading"),
    item(3, "Skipped"),
    item(5, "To read"),
    item(4, "To read"),
    item(7, "To read"),
  ];

  it("returns the next 3 after the next item, by Order", () => {
    expect(pickUpcoming(items).map((i) => i.order)).toEqual([4, 5, 6]);
  });

  it("respects n and the end of the list", () => {
    expect(pickUpcoming(items, 1).map((i) => i.order)).toEqual([4]);
    expect(pickUpcoming(items, 10).map((i) => i.order)).toEqual([4, 5, 6, 7]);
    expect(pickUpcoming([item(1, "To read")])).toEqual([]);
  });
});

describe("readScope", () => {
  it("returns the whole trimmed note when it starts with Read:", () => {
    expect(readScope("  Read: abstract, intro, conclusion \n")).toBe(
      "Read: abstract, intro, conclusion",
    );
  });

  it("returns null for other notes", () => {
    expect(readScope("")).toBeNull();
    expect(readScope("Long book. Read: chapter 1")).toBeNull();
    expect(readScope("read: lower case")).toBeNull();
  });
});

describe("pairedTitles", () => {
  it("resolves ids to titles and skips unknown ids", () => {
    const a = item(1, "To read", { title: "Answered A" });
    const b = item(2, "To read", { title: "Answered B" });
    const c = item(3, "To read", {
      layer: "5 · Counterweights",
      // b given without dashes: ids from relations may differ in format.
      pairedWith: [a.id, "ffffffff-0000-0000-0000-000000000000", b.id.replace(/-/g, "")],
    });
    expect(pairedTitles(c, [a, b, c])).toEqual(["Answered A", "Answered B"]);
  });

  it("returns [] when there are no pairs", () => {
    const a = item(1, "To read");
    expect(pairedTitles(a, [a])).toEqual([]);
  });
});

describe("todayInRome", () => {
  it("uses the Rome date, not the UTC date (summer, UTC+2)", () => {
    // 22:30 UTC on 10 Oct = 00:30 on 11 Oct in Rome.
    expect(todayInRome(new Date("2026-10-10T22:30:00Z"))).toBe("2026-10-11");
    expect(todayInRome(new Date("2026-10-10T21:59:00Z"))).toBe("2026-10-10");
  });

  it("handles winter time (UTC+1) and year change", () => {
    expect(todayInRome(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(todayInRome(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
  });

  it("has the YYYY-MM-DD format", () => {
    expect(todayInRome()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatMinutes", () => {
  it("formats minutes", () => {
    expect(formatMinutes(30)).toBe("30 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(95)).toBe("1 h 35 min");
    expect(formatMinutes(null)).toBeNull();
  });
});
