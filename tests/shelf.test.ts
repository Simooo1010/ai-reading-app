import { describe, expect, it } from "vitest";
import {
  coverChip,
  coverNumeral,
  isCounterweight,
  moveSelection,
  spineFill,
  spineHeight,
  spineLabel,
  spineWidth,
} from "@/lib/shelf";

describe("spine geometry", () => {
  it("width = 5 + minutes * 0.22", () => {
    expect(spineWidth(10)).toBe(7.2);
    expect(spineWidth(100)).toBe(27);
    expect(spineWidth(null)).toBe(5);
    expect(spineWidth(-4)).toBe(5);
  });
  it("height follows difficulty; Skipped is 40%", () => {
    expect(spineHeight("Easy", "To read")).toBe(0.55);
    expect(spineHeight("Medium", "Done")).toBe(0.76);
    expect(spineHeight("Hard", "Reading")).toBe(1);
    expect(spineHeight("Hard", "Skipped")).toBe(0.4);
  });
});

describe("spine fill", () => {
  it("maps status to a fill pattern", () => {
    expect(spineFill("Done", false)).toBe("done");
    expect(spineFill("Skipped", true)).toBe("skipped");
    expect(spineFill("Reading", false)).toBe("active");
    expect(spineFill("To read", true)).toBe("active");
    expect(spineFill("To read", false)).toBe("todo");
  });
  it("only the Counterweights layer is hatched", () => {
    expect(isCounterweight("5 · Counterweights")).toBe(true);
    expect(isCounterweight("1 · Foundations")).toBe(false);
  });
});

describe("cover", () => {
  it("pads the numeral to 3 digits", () => {
    expect(coverNumeral(1)).toBe("001");
    expect(coverNumeral(189)).toBe("189");
  });
  it("chip is the priority until the item is under way", () => {
    expect(coverChip("To read", "Core")).toBe("Core");
    expect(coverChip("Reading", "Core")).toBe("Reading");
    expect(coverChip("Done", "Core")).toBe("Done");
  });
  it("builds an accessible spine label", () => {
    expect(spineLabel(1, "The Bitter Lesson", 10, "Easy", "To read")).toBe(
      "01, The Bitter Lesson, 10 min, Easy, To read",
    );
    expect(spineLabel(12, "X", null, "Hard", "Done")).toBe("12, X, Hard, Done");
  });
});

describe("moveSelection", () => {
  const ids = ["a", "b", "c"];
  it("moves one step and clamps at the ends", () => {
    expect(moveSelection(ids, "a", 1)).toBe("b");
    expect(moveSelection(ids, "c", 1)).toBe("c");
    expect(moveSelection(ids, "a", -1)).toBe("a");
  });
  it("starts at an end when nothing is selected", () => {
    expect(moveSelection(ids, null, 1)).toBe("a");
    expect(moveSelection(ids, null, -1)).toBe("c");
    expect(moveSelection([], null, 1)).toBeNull();
  });
});
