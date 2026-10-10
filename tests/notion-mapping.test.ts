import { describe, expect, it } from "vitest";
import { mapPage, type NotionPageLike } from "@/lib/notion";

// Fixture shaped like a Notion page from `dataSources.query` (only the fields
// mapPage reads). Values are test data, not real Notion content.
function rt(text: string) {
  return text === ""
    ? []
    : [
        {
          type: "text",
          text: { content: text, link: null },
          annotations: {
            bold: false,
            italic: false,
            strikethrough: false,
            underline: false,
            code: false,
            color: "default",
          },
          plain_text: text,
          href: null,
        },
      ];
}

function select(name: string | null) {
  return name === null ? null : { id: "x", name, color: "default" };
}

function fixture(): NotionPageLike {
  const properties = {
    Title: { id: "title", type: "title", title: rt("Test essay") },
    Layer: { id: "l", type: "select", select: select("5 · Counterweights") },
    Author: { id: "a", type: "rich_text", rich_text: rt("Test Author") },
    Type: { id: "t", type: "select", select: select("Article") },
    Link: { id: "u", type: "url", url: "https://example.com/essay" },
    Published: {
      id: "p",
      type: "date",
      date: { start: "2022-03-10", end: null, time_zone: null },
    },
    "Reading time (min)": { id: "r", type: "number", number: 30 },
    Difficulty: { id: "d", type: "select", select: select("Easy") },
    Priority: { id: "pr", type: "select", select: select("Core") },
    Status: { id: "s", type: "select", select: select("To read") },
    "Why read this": { id: "w", type: "rich_text", rich_text: rt("Because.") },
    "Found via": { id: "f", type: "rich_text", rich_text: rt("") },
    "Paired with": {
      id: "pw",
      type: "relation",
      relation: [{ id: "page-a" }, { id: "page-b" }],
      has_more: false,
    },
    Phase: { id: "ph", type: "select", select: select("Phase 1") },
    Order: { id: "o", type: "number", number: 3 },
    Verified: { id: "v", type: "checkbox", checkbox: true },
    "Added in": { id: "ai", type: "select", select: select("Chat 2") },
    Notes: {
      id: "n",
      type: "rich_text",
      rich_text: rt("Read: abstract, intro, conclusion"),
    },
    "Done on": { id: "do", type: "date", date: null },
  };
  return { id: "page-1", properties } as unknown as NotionPageLike;
}

type Props = Record<string, unknown>;
function withProp(name: string, value: unknown): NotionPageLike {
  const page = fixture();
  (page.properties as Props)[name] = value;
  return page;
}

describe("mapPage", () => {
  it("maps every property with the exact Notion names", () => {
    expect(mapPage(fixture())).toEqual({
      id: "page-1",
      title: "Test essay",
      layer: "5 · Counterweights",
      author: "Test Author",
      type: "Article",
      link: "https://example.com/essay",
      published: "2022-03-10",
      readingTimeMin: 30,
      difficulty: "Easy",
      priority: "Core",
      status: "To read",
      whyRead: "Because.",
      foundVia: "",
      pairedWith: ["page-a", "page-b"],
      phase: "Phase 1",
      order: 3,
      verified: true,
      addedIn: "Chat 2",
      notes: "Read: abstract, intro, conclusion",
      doneOn: null,
    });
  });

  it("maps an empty Published date to null", () => {
    const page = withProp("Published", { id: "p", type: "date", date: null });
    expect(mapPage(page).published).toBeNull();
  });

  it("throws when a property is missing, naming property and page", () => {
    const page = fixture();
    delete (page.properties as Props)["Layer"];
    expect(() => mapPage(page)).toThrow(/page-1.*"Layer" is missing/);
  });

  it("throws on an unknown select option (no guessing)", () => {
    // Plain "." instead of the U+00B7 middle dot.
    const page = withProp("Layer", {
      id: "l",
      type: "select",
      select: select("5 . Counterweights"),
    });
    expect(() => mapPage(page)).toThrow(/"Layer" has unknown option/);
  });

  it("does not fail on a new or empty 'Added in' option (the app never shows it)", () => {
    const newOption = withProp("Added in", { id: "ai", type: "select", select: select("Chat 10") });
    expect(mapPage(newOption).addedIn).toBe("Chat 10");
    const empty = withProp("Added in", { id: "ai", type: "select", select: null });
    expect(mapPage(empty).addedIn).toBe("");
    // The property itself must still be a select: wrong type still stops and reports.
    const wrongType = withProp("Added in", { id: "ai", type: "checkbox", checkbox: true });
    expect(() => mapPage(wrongType)).toThrow(/"Added in"/);
  });

  it("throws when Status has the wrong Notion type", () => {
    const page = withProp("Status", {
      id: "s",
      type: "status",
      status: { id: "x", name: "To read", color: "default" },
    });
    expect(() => mapPage(page)).toThrow(/"Status" has type "status"/);
  });

  it("throws when a required select is empty", () => {
    const page = withProp("Priority", {
      id: "pr",
      type: "select",
      select: null,
    });
    expect(() => mapPage(page)).toThrow(/"Priority" is empty/);
  });

  it("throws when Order is empty", () => {
    const page = withProp("Order", { id: "o", type: "number", number: null });
    expect(() => mapPage(page)).toThrow(/"Order" is empty/);
  });
});
