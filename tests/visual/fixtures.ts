// Test fixtures only (made-up items, never shown in the app).
import type { PathRowData, PhaseView } from "@/lib/path";
import type { CardData } from "@/lib/today";
import type { Item, Layer, Priority, Status } from "@/lib/types";

export function card(extra: Partial<CardData> = {}): CardData {
  return {
    id: "00000000-0000-0000-0000-000000000003",
    order: 3,
    title: "Fixture: A Counterweight Essay With a Longer Title",
    author: "Fixture Author",
    type: "Article",
    layer: "5 · Counterweights",
    priority: "Core",
    phase: "Phase 1",
    status: "To read",
    difficulty: "Medium",
    readingTimeMin: 30,
    whyRead:
      "Fixture text. It argues the other side, so you can test the main idea against a strong critic.",
    link: "https://example.com/fixture",
    scope: null,
    answers: [],
    ...extra,
  };
}

export const READING_COUNTERWEIGHT = card({
  status: "Reading",
  scope: "Read: abstract, intro, conclusion",
  answers: ["Fixture Answered Essay A", "Fixture Answered Essay B"],
});

export const PLAIN = card({
  id: "00000000-0000-0000-0000-000000000001",
  order: 1,
  title: "Fixture Essay",
  layer: "1 · Foundations",
  type: "Essay",
  difficulty: "Easy",
  readingTimeMin: 10,
});

export const UP_NEXT = [4, 5, 6].map((order) => ({
  id: `00000000-0000-0000-0000-00000000000${order}`,
  order,
  title: `Fixture item ${order}`,
  author: "Fixture Author",
  readingTimeMin: order * 5,
  layer: "3 · Species" as const,
}));

function row(order: number, status: Status, min = 15, title?: string): PathRowData {
  return {
    id: `00000000-0000-0000-0000-${String(order).padStart(12, "0")}`,
    order,
    title: title ?? `Fixture item ${order}`,
    readingTimeMin: min,
    status,
  };
}

export const PHASES: PhaseView[] = [
  {
    phase: "Phase 1",
    number: 1,
    isNow: true,
    countText: "2 of 5 items done · 1 skipped",
    hoursDone: "0.7",
    hoursTotal: "1.8",
    percent: (40 / 110) * 100,
    rows: [
      row(1, "Done", 10),
      row(2, "Done", 30, "Fixture: a longer title that runs onto two lines on a phone"),
      row(3, "Skipped", 20),
      row(4, "Reading", 35),
      row(5, "To read", 25),
      row(6, "To read", 10),
    ],
  },
  {
    phase: "Phase 2",
    number: 2,
    isNow: false,
    countText: "0 of 2 items done",
    hoursDone: "0.0",
    hoursTotal: "0.5",
    percent: 0,
    rows: [row(7, "To read"), row(8, "To read")],
  },
  {
    phase: "Phase 6",
    number: 6,
    isNow: false,
    countText: "1 of 1 item done",
    hoursDone: "2.3",
    hoursTotal: "2.3",
    percent: 100,
    rows: [row(120, "Done", 140)],
  },
];

// ---------- Progress screen fixtures ----------

/** Fixed "today" for the Progress fixtures: Saturday 10 Oct 2026. */
export const PROGRESS_TODAY = "2026-10-10";

let progressSeq = 0;
function pItem(
  status: Status,
  readingTimeMin: number,
  extra: { doneOn?: string | null; layer?: Layer; priority?: Priority } = {},
): Item {
  progressSeq++;
  return {
    id: `00000000-0000-0000-0001-${String(progressSeq).padStart(12, "0")}`,
    title: `Fixture item ${progressSeq}`,
    layer: extra.layer ?? "3 · Species",
    author: "Fixture Author",
    type: "Essay",
    link: `https://example.com/fixture/${progressSeq}`,
    published: null,
    readingTimeMin,
    difficulty: "Easy",
    priority: extra.priority ?? "Optional",
    status,
    whyRead: "",
    foundVia: "",
    pairedWith: [],
    phase: "Phase 1",
    order: progressSeq,
    verified: true,
    addedIn: "Chat 2",
    notes: "",
    doneOn: extra.doneOn ?? null,
  };
}

/** Rest of the list, never done (keeps a realistic total). */
function rest(): Item[] {
  return [
    pItem("To read", 600, { layer: "1 · Foundations", priority: "Core" }),
    pItem("To read", 900, { layer: "2 · Leaders", priority: "Recommended" }),
    pItem("To read", 2400, { layer: "3 · Species" }),
    pItem("Reading", 500, { layer: "4 · Frontier essays", priority: "Recommended" }),
    pItem("To read", 300, { layer: "5 · Counterweights", priority: "Core" }),
  ];
}

/**
 * Several weeks of reading: a gap (week of 21 Sep empty), a week above the
 * 5 h target (week of 14 Sep, 7 h), a 3-day streak (8–10 Oct), this week
 * 2.5 h, a Skipped item, a Counterweights item, Core items → a date.
 */
export const PROGRESS_ACTIVE: Item[] = [
  pItem("Done", 60, { doneOn: "2026-08-19", layer: "1 · Foundations", priority: "Core" }),
  pItem("Done", 120, { doneOn: "2026-09-02", layer: "2 · Leaders", priority: "Core" }),
  pItem("Done", 240, { doneOn: "2026-09-15", layer: "3 · Species" }),
  pItem("Done", 180, { doneOn: "2026-09-18", layer: "3 · Species", priority: "Recommended" }),
  pItem("Done", 54, { doneOn: "2026-09-29", layer: "5 · Counterweights", priority: "Core" }),
  pItem("Done", 30, { doneOn: "2026-10-08", layer: "4 · Frontier essays", priority: "Core" }),
  pItem("Done", 75, { doneOn: "2026-10-09", layer: "1 · Foundations", priority: "Core" }),
  pItem("Done", 45, { doneOn: "2026-10-10", layer: "3 · Species" }),
  pItem("Done", 40, { doneOn: null, layer: "2 · Leaders" }), // Done, no date
  pItem("Skipped", 500, { layer: "3 · Species" }),
  ...rest(),
];

/** The current week above the target (7 h) and the week before at 5 h. */
export const PROGRESS_THIS_WEEK_HIGH: Item[] = [
  pItem("Done", 300, { doneOn: "2026-09-30", layer: "3 · Species" }),
  pItem("Done", 240, { doneOn: "2026-10-05", layer: "2 · Leaders", priority: "Core" }),
  pItem("Done", 180, { doneOn: "2026-10-10", layer: "3 · Species" }),
  ...rest(),
];

/** Done long ago only: no pace in the last 4 weeks ("none"), streak 0. */
export const PROGRESS_NONE: Item[] = [
  pItem("Done", 90, { doneOn: "2026-08-03", layer: "1 · Foundations", priority: "Core" }),
  pItem("Done", 60, { doneOn: "2026-08-20", layer: "3 · Species" }),
  ...rest(),
];

/** Everything Done or Skipped ("finished"). */
export const PROGRESS_FINISHED: Item[] = [
  pItem("Done", 120, { doneOn: "2026-10-01", layer: "1 · Foundations", priority: "Core" }),
  pItem("Done", 200, { doneOn: "2026-10-06", layer: "3 · Species" }),
  pItem("Done", 60, { doneOn: "2026-10-09", layer: "5 · Counterweights", priority: "Recommended" }),
  pItem("Skipped", 90, { layer: "2 · Leaders" }),
];
