import { describe, expect, it } from "vitest";
import {
  ariaLabelForLayerBars,
  ariaLabelForWeekBars,
  layerBars,
  layerName,
  normalizeTarget,
  weekBars,
} from "@/lib/charts";
import { hoursByLayer, weeklyHours, type LayerHours, type WeekHours } from "@/lib/stats";
import type { Item } from "@/lib/types";

// Test fixtures only (not real Notion content).
function weeks(minutes: number[], firstMonday = "2026-08-17"): WeekHours[] {
  const start = Date.UTC(
    Number(firstMonday.slice(0, 4)),
    Number(firstMonday.slice(5, 7)) - 1,
    Number(firstMonday.slice(8, 10)),
  );
  return minutes.map((m, i) => ({
    weekStart: new Date(start + i * 7 * 86_400_000).toISOString().slice(0, 10),
    minutes: m,
    hours: m / 60,
    isCurrent: i === minutes.length - 1,
  }));
}

describe("weekBars", () => {
  // Matches the README example: week 7 = 0.875 h, current week = 1.2 h.
  const g = weekBars(weeks([0, 60, 0, 120, 30, 90, 52.5, 72]), 5);

  it("uses 20 px per hour for a 5 h target, target line at y 42", () => {
    expect(g.width).toBe(342);
    expect(g.height).toBe(182);
    expect(g.scale).toBe(20);
    expect(g.baselineY).toBe(142.5);
    expect(g.target).toEqual({
      hours: 5,
      y: 42,
      label: { text: "Target 5 h", x: 342, y: 34 },
    });
  });

  it("places past and current bars exactly like the README example", () => {
    expect(g.bars[6].bar).toEqual({ x: 266.4, y: 124.5, width: 23, height: 17.5 });
    expect(g.bars[6].barStyle).toBe("past");
    expect(g.bars[7].bar).toEqual({ x: 308.6, y: 118, width: 24, height: 24 });
    expect(g.bars[7].barStyle).toBe("current");
  });

  it("centres bars in 8 slots of 342/8", () => {
    expect(g.bars.map((b) => b.cx)).toEqual([
      21.4, 64.1, 106.9, 149.6, 192.4, 235.1, 277.9, 320.6,
    ]);
    // 2 h past bar: 40 px tall, standing on y 142.
    expect(g.bars[3].bar).toEqual({ x: 138.1, y: 102, width: 23, height: 40 });
  });

  it("draws no bar for an empty week, only the '0' label above the baseline", () => {
    expect(g.bars[0].bar).toBeNull();
    expect(g.bars[0].value).toEqual({ text: "0", y: 136, inside: false });
  });

  it("puts past values 6 px above the bar and the current value inside it", () => {
    expect(g.bars[3].value).toEqual({ text: "2", y: 96, inside: false });
    expect(g.bars[6].value).toEqual({ text: "0.9", y: 118.5, inside: false });
    expect(g.bars[7].value).toEqual({ text: "1.2", y: 134, inside: true });
  });

  it("puts the current value above its bar when the bar is short", () => {
    const short = weekBars(weeks([0, 30]), 5); // 0.5 h → 10 px
    expect(short.bars[1].bar?.height).toBe(10);
    expect(short.bars[1].value).toEqual({ text: "0.5", y: 126, inside: false });
  });

  it("shrinks the scale when a week is above the target", () => {
    const big = weekBars(weeks([600, 0, 0, 0, 0, 0, 0, 300]), 5); // 10 h week
    expect(big.scale).toBe(10);
    const top = big.bars[0].bar!;
    expect(top.height).toBe(100);
    // max × 1.4 fits in the plot: 140 px above y 142 → y 2
    expect(142 - 10 * 1.4 * big.scale).toBeGreaterThanOrEqual(0);
    expect(big.target.y).toBe(92);
    expect(big.target.label.y).toBe(84);
    expect(big.bars[7].bar?.height).toBe(50);
  });

  it("keeps the target at the same height for another target", () => {
    const t = weekBars(weeks([0, 0]), 2.5);
    expect(t.scale).toBe(40);
    expect(t.target.y).toBe(42);
    expect(t.target.label.text).toBe("Target 2.5 h");
  });

  it("falls back to 5 h for an invalid target", () => {
    expect(normalizeTarget(0)).toBe(5);
    expect(normalizeTarget(-1)).toBe(5);
    expect(normalizeTarget(Number.NaN)).toBe(5);
    expect(normalizeTarget(3)).toBe(3);
    expect(weekBars(weeks([0]), 0).scale).toBe(20);
  });

  it("ticks show the Monday date; the month only first and when it changes", () => {
    expect(g.bars.map((b) => b.tick.text)).toEqual([
      "17", "24", "31", "7", "14", "21", "28", "5",
    ]);
    expect(g.bars.every((b) => b.tick.y === 160)).toBe(true);
    expect(g.bars.map((b) => b.month?.text ?? null)).toEqual([
      "Aug", null, null, "Sep", null, null, null, "Oct",
    ]);
    expect(g.bars[0].month?.y).toBe(176);
  });

  it("works from real weeklyHours output", () => {
    const items = [
      { status: "Done", readingTimeMin: 72, doneOn: "2026-10-06", layer: "1 · Foundations", priority: "Core" },
    ] as Item[];
    const out = weekBars(weeklyHours(items, "2026-10-10"), 5);
    expect(out.bars[7].bar).toEqual({ x: 308.6, y: 118, width: 24, height: 24 });
    expect(out.bars.slice(0, 7).every((b) => b.bar === null)).toBe(true);
  });
});

describe("ariaLabelForWeekBars", () => {
  it("says every week's number in words", () => {
    const label = ariaLabelForWeekBars(weeks([0, 60, 52.5]), 5);
    expect(label).toBe(
      "Hours read per week, last 3 weeks, target 5 hours. " +
        "Week of 17 Aug: 0 hours. Week of 24 Aug: 1 hour. This week: 0.9 hours.",
    );
  });
});

describe("layerBars", () => {
  const row = (layer: LayerHours["layer"], done: number, total: number): LayerHours => ({
    layer,
    itemsDone: 0,
    itemsTotal: 0,
    minutesDone: done,
    minutesTotal: total,
    hoursDone: done / 60,
    hoursTotal: total / 60,
  });
  const rows = [
    row("1 · Foundations", 60, 315),
    row("2 · Leaders", 0, 966),
    row("3 · Species", 1503, 3006),
    row("4 · Frontier essays", 0, 0),
    row("5 · Counterweights", 408, 408),
  ];
  const g = layerBars(rows);

  it("stacks rows 48 px apart", () => {
    expect(g.width).toBe(342);
    expect(g.height).toBe(240);
    expect(g.rows.map((r) => r.y)).toEqual([0, 48, 96, 144, 192]);
    expect(g.rows[1]).toMatchObject({ labelY: 64, trackY: 72, trackHeight: 10 });
  });

  it("makes tracks proportional to the layer total, the largest full width", () => {
    expect(g.rows[2].trackWidth).toBe(342);
    expect(g.rows[0].trackWidth).toBe(35.8); // 342 × 315 / 3006
    expect(g.rows[1].trackWidth).toBe(109.9); // 342 × 966 / 3006
    expect(g.rows[3].trackWidth).toBe(0);
  });

  it("fills the done part of each track", () => {
    expect(g.rows[2].fillWidth).toBe(171); // half done
    expect(g.rows[4].fillWidth).toBe(g.rows[4].trackWidth); // all done
    expect(g.rows[1].fillWidth).toBe(0);
    expect(g.rows[3].fillWidth).toBe(0);
    expect(g.rows[0].fillWidth).toBe(6.8); // 35.8 × 60 / 315
  });

  it("labels with the name and 'done of total h'", () => {
    expect(g.rows[0]).toMatchObject({ label: "Foundations", valueText: "1 of 5.3 h" });
    expect(g.rows[3].valueText).toBe("0 of 0 h");
    expect(layerName("4 · Frontier essays")).toBe("Frontier essays");
  });

  it("is all zero for no data", () => {
    const empty = layerBars(hoursByLayer([]));
    expect(empty.rows).toHaveLength(5);
    expect(empty.rows.every((r) => r.trackWidth === 0 && r.fillWidth === 0)).toBe(true);
  });

  it("aria label says the numbers in words", () => {
    expect(ariaLabelForLayerBars(rows.slice(0, 2))).toBe(
      "Hours read by layer, done of total. Foundations: 1 of 5.3 hours. Leaders: 0 of 16.1 hours.",
    );
  });
});
