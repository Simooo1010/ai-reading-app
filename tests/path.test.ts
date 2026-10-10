import { describe, expect, it } from "vitest";
import {
  currentPhase,
  formatHours,
  formatOrder,
  formatPathSummary,
  formatPhaseCount,
  groupByPhase,
  minutesToHours,
  pathPhases,
  phaseNumber,
  phaseStats,
  sumMinutes,
} from "@/lib/path";
import { toCardData, todayContext } from "@/lib/today";
import type { Item, Phase, Status } from "@/lib/types";

// Test fixtures only (not real Notion content).
function item(
  order: number,
  status: Status,
  phase: Phase = "Phase 1",
  min: number | null = 10,
  extra: Partial<Item> = {},
): Item {
  return {
    id: `00000000-0000-0000-0000-${String(order).padStart(12, "0")}`,
    title: `Item ${order}`,
    layer: "1 · Foundations",
    author: "Test Author",
    type: "Essay",
    link: `https://example.com/${order}`,
    published: null,
    readingTimeMin: min,
    difficulty: "Easy",
    priority: "Core",
    status,
    whyRead: "",
    foundVia: "",
    pairedWith: [],
    phase,
    order,
    verified: true,
    addedIn: "Chat 2",
    notes: "",
    doneOn: null,
    ...extra,
  };
}

describe("groupByPhase", () => {
  it("groups by phase number, items in Order, only phases with items", () => {
    const items = [
      item(5, "To read", "Phase 3"),
      item(2, "To read", "Phase 1"),
      item(1, "Done", "Phase 1"),
      item(4, "To read", "Phase 3"),
    ];
    const groups = groupByPhase(items);
    expect(groups.map((g) => g.phase)).toEqual(["Phase 1", "Phase 3"]);
    expect(groups[0].items.map((i) => i.order)).toEqual([1, 2]);
    expect(groups[1].items.map((i) => i.order)).toEqual([4, 5]);
    expect(groups[1].number).toBe(3);
  });

  it("never drops items: a Phase 6 item gets its own group", () => {
    const items = [item(1, "To read", "Phase 6"), item(2, "To read", "Phase 2")];
    const groups = groupByPhase(items);
    expect(groups.map((g) => g.phase)).toEqual(["Phase 2", "Phase 6"]);
    expect(groups.flatMap((g) => g.items)).toHaveLength(2);
  });

  it("returns [] for no items", () => {
    expect(groupByPhase([])).toEqual([]);
  });

  it("phaseNumber parses the label", () => {
    expect(phaseNumber("Phase 1")).toBe(1);
    expect(phaseNumber("Phase 6")).toBe(6);
  });
});

describe("phaseStats", () => {
  it("excludes Skipped from items and hours (both sides)", () => {
    const items = [
      item(1, "Done", "Phase 1", 10),
      item(2, "Done", "Phase 1", 45),
      item(3, "Skipped", "Phase 1", 20),
      item(4, "Reading", "Phase 1", 35),
      item(5, "To read", "Phase 1", 25),
    ];
    const s = phaseStats(items);
    expect(s.itemsDone).toBe(2);
    expect(s.itemsTotal).toBe(4);
    expect(s.skipped).toBe(1);
    expect(s.minutesDone).toBe(55);
    expect(s.minutesTotal).toBe(115);
    expect(s.hoursDone).toBe(0.9);
    expect(s.hoursTotal).toBe(1.9);
    expect(s.percent).toBeCloseTo((55 / 115) * 100, 10);
  });

  it("counts an empty reading time as 0 minutes", () => {
    const s = phaseStats([item(1, "Done", "Phase 1", null), item(2, "To read")]);
    expect(s.minutesDone).toBe(0);
    expect(s.minutesTotal).toBe(10);
    expect(s.itemsDone).toBe(1);
  });

  it("is 0 % when everything is skipped or there is nothing", () => {
    expect(phaseStats([item(1, "Skipped")]).percent).toBe(0);
    expect(phaseStats([item(1, "Skipped")]).itemsTotal).toBe(0);
    expect(phaseStats([]).percent).toBe(0);
  });
});

describe("hours", () => {
  it("rounds whole minutes to 1 decimal, half up", () => {
    expect(minutesToHours(5355)).toBe(89.3); // 89.25 h
    expect(formatHours(5355)).toBe("89.3");
    expect(formatHours(414)).toBe("6.9");
    expect(formatHours(0)).toBe("0.0");
    expect(formatHours(60)).toBe("1.0");
    expect(formatHours(3)).toBe("0.1"); // 0.05 h
    expect(formatHours(2)).toBe("0.0"); // 0.033 h
  });

  it("sums minutes before dividing (no float drift)", () => {
    // 3 × 0.1 h added as decimals would give 0.30000000000000004.
    const items = [item(1, "To read", "Phase 1", 6), item(2, "To read", "Phase 1", 6), item(3, "To read", "Phase 1", 6)];
    expect(sumMinutes(items)).toBe(18);
    expect(phaseStats(items).hoursTotal).toBe(0.3);
  });
});

describe("formatPhaseCount", () => {
  it("adds the skipped part only when something is skipped", () => {
    const withSkip = phaseStats([item(1, "Done"), item(2, "Skipped"), item(3, "To read")]);
    expect(formatPhaseCount(withSkip)).toBe("1 of 2 items done · 1 skipped");
    const noSkip = phaseStats([item(1, "To read"), item(2, "To read")]);
    expect(formatPhaseCount(noSkip)).toBe("0 of 2 items done");
  });

  it("uses the singular for one item", () => {
    expect(formatPhaseCount(phaseStats([item(1, "To read")]))).toBe("0 of 1 item done");
  });
});

describe("currentPhase", () => {
  it("is the phase of the next item (lowest Order, Reading or To read)", () => {
    const items = [
      item(1, "Done", "Phase 1"),
      item(2, "Skipped", "Phase 1"),
      item(3, "To read", "Phase 2"),
      item(4, "Reading", "Phase 3"),
    ];
    expect(currentPhase(items)).toBe("Phase 2");
  });

  it("is null when nothing is left", () => {
    expect(currentPhase([item(1, "Done"), item(2, "Skipped")])).toBeNull();
  });
});

describe("formatPathSummary", () => {
  it("counts non-Skipped items and their hours", () => {
    const items = [item(1, "Done", "Phase 1", 30), item(2, "Skipped", "Phase 1", 60), item(3, "To read", "Phase 2", 45)];
    expect(formatPathSummary(items)).toBe("2 items · 1.3 h"); // 75 min = 1.25 h
  });
});

describe("formatOrder", () => {
  it("pads to 2 digits", () => {
    expect(formatOrder(3)).toBe("03");
    expect(formatOrder(13)).toBe("13");
    expect(formatOrder(189)).toBe("189");
  });
});

describe("todayContext", () => {
  it("names the phase and order of the next item out of all items", () => {
    const items = [item(1, "Done"), item(2, "Skipped"), item(3, "To read", "Phase 2"), item(4, "To read")];
    expect(todayContext(items)).toBe("Phase 2 · item 3 of 4");
  });

  it("says All done when nothing is left", () => {
    expect(todayContext([item(1, "Done")])).toBe("All done");
  });
});

describe("toCardData", () => {
  it("keeps only card fields, with scope and answers", () => {
    const answered = item(1, "To read", "Phase 1", 10, { title: "Answered" });
    const cw = item(2, "Reading", "Phase 1", 30, {
      layer: "5 · Counterweights",
      pairedWith: [answered.id],
      notes: "Read: part 1",
      foundVia: "not sent",
    });
    const card = toCardData(cw, [answered, cw]);
    expect(card.answers).toEqual(["Answered"]);
    expect(card.scope).toBe("Read: part 1");
    expect(card).not.toHaveProperty("foundVia");
    expect(card).not.toHaveProperty("notes");
    expect(card).not.toHaveProperty("pairedWith");
  });

  it("has no answers for other layers", () => {
    const a = item(1, "To read");
    const b = item(2, "To read", "Phase 1", 10, { pairedWith: [a.id] });
    expect(toCardData(b, [a, b]).answers).toEqual([]);
  });
});

describe("pathPhases", () => {
  it("marks only the current phase as Now and builds the lines", () => {
    const items = [
      item(1, "Done", "Phase 1", 30),
      item(2, "Skipped", "Phase 1", 20),
      item(3, "To read", "Phase 2", 45),
      item(4, "To read", "Phase 2", 15),
    ];
    const phases = pathPhases(items);
    expect(phases.map((p) => [p.phase, p.isNow])).toEqual([
      ["Phase 1", false],
      ["Phase 2", true],
    ]);
    expect(phases[0]).toMatchObject({
      countText: "1 of 1 item done · 1 skipped",
      hoursDone: "0.5",
      hoursTotal: "0.5",
      percent: 100,
    });
    expect(phases[1]).toMatchObject({
      countText: "0 of 2 items done",
      hoursDone: "0.0",
      hoursTotal: "1.0",
      percent: 0,
    });
    expect(phases[1].rows.map((r) => r.order)).toEqual([3, 4]);
    expect(Object.keys(phases[1].rows[0]).sort()).toEqual(
      ["id", "order", "readingTimeMin", "status", "title"],
    );
  });

  it("has no Now phase when all is done", () => {
    expect(pathPhases([item(1, "Done")]).some((p) => p.isNow)).toBe(false);
  });
});
