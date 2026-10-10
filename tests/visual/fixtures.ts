// Test fixtures only (made-up items, never shown in the app).
import type { PathRowData, PhaseView } from "@/lib/path";
import type { CardData } from "@/lib/today";
import type { Status } from "@/lib/types";

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
