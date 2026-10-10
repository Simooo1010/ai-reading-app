// Types for the Notion database `AI Reading List`.
// All labels are copied exactly from SPEC.md §4 (case, spaces and the
// U+00B7 middle dot "·" included). Do not rename them.

export const LAYERS = [
  "1 · Foundations",
  "2 · Leaders",
  "3 · Species",
  "4 · Frontier essays",
  "5 · Counterweights",
] as const;
export type Layer = (typeof LAYERS)[number];

export const ITEM_TYPES = [
  "Essay",
  "Paper",
  "Report",
  "Book",
  "Book chapter",
  "Newsletter issue",
  "Article",
  "Talk transcript",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const PRIORITIES = ["Core", "Recommended", "Optional"] as const;
export type Priority = (typeof PRIORITIES)[number];

// `Status` is a Notion *select* property (not the Notion "status" type).
export const STATUSES = ["To read", "Reading", "Done", "Skipped"] as const;
export type Status = (typeof STATUSES)[number];

// The Notion property has options Phase 1…Phase 6, but only Phase 1–5 are
// used by items. `Phase 6` is accepted so the mapping never fails on a valid
// Notion option; Path shows every phase that has items (so a Phase 6 item
// would get its own group, never dropped).
export const PHASES = [
  "Phase 1",
  "Phase 2",
  "Phase 3",
  "Phase 4",
  "Phase 5",
  "Phase 6",
] as const;
export type Phase = (typeof PHASES)[number];

export const ADDED_IN = [
  "Chat 2",
  "Chat 3",
  "Chat 4",
  "Chat 5",
  "Chat 6",
  "Chat 9",
] as const;
export type AddedIn = (typeof ADDED_IN)[number];

/** One row of `AI Reading List`. Field comments name the Notion property. */
export type Item = {
  /** Notion page id */
  id: string;
  /** `Title` (title) */
  title: string;
  /** `Layer` (select) */
  layer: Layer;
  /** `Author` (rich_text); "" when empty */
  author: string;
  /** `Type` (select) */
  type: ItemType;
  /** `Link` (url) */
  link: string;
  /** `Published` (date), "YYYY-MM-DD" start date; null when empty */
  published: string | null;
  /** `Reading time (min)` (number); null when empty */
  readingTimeMin: number | null;
  /** `Difficulty` (select) */
  difficulty: Difficulty;
  /** `Priority` (select) */
  priority: Priority;
  /** `Status` (select) */
  status: Status;
  /** `Why read this` (rich_text); "" when empty */
  whyRead: string;
  /** `Found via` (rich_text); "" when empty */
  foundVia: string;
  /** `Paired with` (relation, self): Notion page ids */
  pairedWith: string[];
  /** `Phase` (select) */
  phase: Phase;
  /** `Order` (number): global reading order */
  order: number;
  /** `Verified` (checkbox) */
  verified: boolean;
  /** `Added in` (select) */
  addedIn: AddedIn;
  /** `Notes` (rich_text); "" when empty */
  notes: string;
  /** `Done on` (date), "YYYY-MM-DD" start date; null when empty */
  doneOn: string | null;
};
