// SERVER ONLY. This is the only file in the app that talks to Notion.
//
// It reads NOTION_TOKEN, which must never reach the browser. Never import this
// file (directly or through another module) from a "use client" component.
// (We do not use the `server-only` package because CLAUDE.md asks us not to
// add dependencies without approval.)
//
// Data access uses @notionhq/client v5 and Notion API version 2025-09-03:
// a database has one or more *data sources*, and rows are read with
// `dataSources.query` (the old `databases.query` is gone in this API version).

import {
  Client,
  isFullPage,
  type PageObjectResponse,
} from "@notionhq/client";
import { cacheLife, cacheTag } from "next/cache";
import {
  ADDED_IN,
  DIFFICULTIES,
  ITEM_TYPES,
  LAYERS,
  PHASES,
  PRIORITIES,
  STATUSES,
  type Item,
  type Status,
} from "@/lib/types";

const NOTION_VERSION = "2025-09-03";

/** Exact Notion property names (SPEC.md §4). */
export const PROP = {
  title: "Title",
  layer: "Layer",
  author: "Author",
  type: "Type",
  link: "Link",
  published: "Published",
  readingTime: "Reading time (min)",
  difficulty: "Difficulty",
  priority: "Priority",
  status: "Status",
  whyRead: "Why read this",
  foundVia: "Found via",
  pairedWith: "Paired with",
  phase: "Phase",
  order: "Order",
  verified: "Verified",
  addedIn: "Added in",
  notes: "Notes",
  doneOn: "Done on",
} as const;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function requireEnv(name: "NOTION_TOKEN" | "NOTION_DATABASE_ID"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}.`);
  }
  return value;
}

let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    client = new Client({
      auth: requireEnv("NOTION_TOKEN"),
      notionVersion: NOTION_VERSION,
    });
  }
  return client;
}

let dataSourceId: string | null = null;

/** The database `AI Reading List` must have exactly one data source. */
async function getDataSourceId(notion: Client): Promise<string> {
  if (dataSourceId) return dataSourceId;
  const databaseId = requireEnv("NOTION_DATABASE_ID");
  const db = await notion.databases.retrieve({ database_id: databaseId });
  if (!("data_sources" in db)) {
    throw new Error("Notion: could not read the data sources of the database.");
  }
  if (db.data_sources.length !== 1) {
    throw new Error(
      `Notion: expected exactly 1 data source in the database, found ${db.data_sources.length}.`,
    );
  }
  dataSourceId = db.data_sources[0].id;
  return dataSourceId;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * All items of `AI Reading List`, sorted by `Order` ascending.
 * Fully paginated (page_size 100, follows has_more / next_cursor).
 * Throws if any page does not match the schema in SPEC.md §4.
 *
 * Not cached. Screens use getItemsCached() below.
 */
export async function getAllItems(): Promise<Item[]> {
  const notion = getClient();
  const data_source_id = await getDataSourceId(notion);

  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res = await notion.dataSources.query({
      data_source_id,
      page_size: 100,
      start_cursor: cursor,
      sorts: [{ property: PROP.order, direction: "ascending" }],
    });
    if (res.request_status?.type === "incomplete") {
      throw new Error(
        `Notion: query result is incomplete (${res.request_status.incomplete_reason ?? "unknown reason"}).`,
      );
    }
    for (const result of res.results) {
      if (!isFullPage(result)) {
        throw new Error(
          `Notion: query returned a non-page or partial result (id ${result.id}).`,
        );
      }
      pages.push(result);
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    if (res.has_more && !res.next_cursor) {
      throw new Error("Notion: has_more is true but next_cursor is missing.");
    }
  } while (cursor);

  const items = pages.map(mapPage);
  // The API already sorts by Order; sort again so the contract holds even if
  // the API sort ever changes.
  items.sort((a, b) => a.order - b.order);
  return items;
}

/** Cache tag of all item data. Every write calls updateTag(ITEMS_TAG). */
export const ITEMS_TAG = "items";

/**
 * getAllItems() with a short server cache (SPEC §9: ~60 s).
 *
 * - revalidate 60 s: after 60 s the next read refreshes the data.
 * - expire 120 s (< 5 min): Next.js treats this as a short-lived cache, so it
 *   is never baked into the build output. The data is always read at request
 *   time (a "dynamic hole"), and a Notion error can never break `next build`.
 * - stale 30 s: how long the browser router may reuse the data without
 *   asking the server again (30 s is the minimum Next.js allows here).
 * - Every write (server actions) calls updateTag(ITEMS_TAG). That expires the
 *   entry at once, and the page re-render in the same response reads fresh.
 */
export async function getItemsCached(): Promise<Item[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 120 });
  cacheTag(ITEMS_TAG);
  return getAllItems();
}

// ---------------------------------------------------------------------------
// Write (SPEC §5): the app changes only `Status` and `Done on`.
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Notion page ids: 32 hex characters, with or without dashes.
const PAGE_ID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export function isStatus(value: unknown): value is Status {
  return (
    typeof value === "string" && (STATUSES as readonly string[]).includes(value)
  );
}

export function isPageId(value: unknown): value is string {
  return typeof value === "string" && PAGE_ID_RE.test(value);
}

/** The exact `properties` payload for a status change. */
export type StatusUpdate = {
  Status: { select: { name: Status } };
  "Done on": { date: { start: string } | null };
};

/**
 * Pure. Builds the only properties the app ever writes (SPEC §5):
 * - `Status` = the new status (one of the 4 known labels)
 * - `Done on` = today (YYYY-MM-DD) when the new status is Done, else cleared.
 * Throws on an unknown status or a bad date, so Notion never gets a new
 * select option or a broken date.
 */
export function buildStatusUpdate(status: Status, today: string): StatusUpdate {
  if (!isStatus(status)) {
    throw new Error(`Unknown status "${String(status)}".`);
  }
  if (status === "Done" && !DATE_RE.test(today)) {
    throw new Error(`Bad date "${today}", expected YYYY-MM-DD.`);
  }
  return {
    [PROP.status]: { select: { name: status } },
    [PROP.doneOn]: { date: status === "Done" ? { start: today } : null },
  } as StatusUpdate;
}

function normalizeId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

/**
 * The ONLY Notion write in the app. Sets `Status` (and `Done on`, see
 * buildStatusUpdate) on one item of `AI Reading List`.
 *
 * Before writing it checks that the page really is a row of this database,
 * so a bad id can never change any other Notion page. It never creates,
 * deletes or archives anything and never touches any other property.
 */
export async function updateItemStatus(
  id: string,
  status: Status,
  today: string,
): Promise<void> {
  if (!isPageId(id)) {
    throw new Error("Invalid item id.");
  }
  const properties = buildStatusUpdate(status, today);

  const notion = getClient();
  const ourDataSourceId = await getDataSourceId(notion);

  const page = await notion.pages.retrieve({ page_id: id });
  if (!isFullPage(page)) {
    throw new Error("Notion: could not read the item.");
  }
  if (
    page.parent.type !== "data_source_id" ||
    normalizeId(page.parent.data_source_id) !== normalizeId(ourDataSourceId)
  ) {
    throw new Error("Notion: this page is not an item of the reading list.");
  }
  if (page.in_trash) {
    throw new Error("Notion: this item is in the trash.");
  }

  await notion.pages.update({ page_id: id, properties });
}

// ---------------------------------------------------------------------------
// Mapping (pure, exported for tests)
// ---------------------------------------------------------------------------

type Properties = PageObjectResponse["properties"];
type PropertyValue = Properties[string];
type PropertyOfType<T extends PropertyValue["type"]> = Extract<
  PropertyValue,
  { type: T }
>;

/** The minimal page shape mapPage needs (a full Notion page satisfies it). */
export type NotionPageLike = Pick<PageObjectResponse, "id" | "properties">;

class MappingError extends Error {
  constructor(pageId: string, property: string, problem: string) {
    super(`Notion page ${pageId}: property "${property}" ${problem}.`);
    this.name = "MappingError";
  }
}

function getProp<T extends PropertyValue["type"]>(
  page: NotionPageLike,
  name: string,
  type: T,
): PropertyOfType<T> {
  const value = page.properties[name];
  if (value === undefined) {
    throw new MappingError(page.id, name, "is missing");
  }
  if (value.type !== type) {
    throw new MappingError(
      page.id,
      name,
      `has type "${value.type}", expected "${type}"`,
    );
  }
  return value as PropertyOfType<T>;
}

function plainText(parts: { plain_text: string }[]): string {
  return parts.map((p) => p.plain_text).join("");
}

function readTitle(page: NotionPageLike, name: string): string {
  const text = plainText(getProp(page, name, "title").title);
  if (!text.trim()) throw new MappingError(page.id, name, "is empty");
  return text;
}

/** Empty rich text → "". */
function readRichText(page: NotionPageLike, name: string): string {
  return plainText(getProp(page, name, "rich_text").rich_text);
}

/** Select whose value must be one of `labels`. Empty → error. */
function readSelect<L extends string>(
  page: NotionPageLike,
  name: string,
  labels: readonly L[],
): L {
  const select = getProp(page, name, "select").select;
  if (select === null) {
    throw new MappingError(page.id, name, "is empty");
  }
  if (!(labels as readonly string[]).includes(select.name)) {
    throw new MappingError(
      page.id,
      name,
      `has unknown option "${select.name}"`,
    );
  }
  return select.name as L;
}

/** Date start as given by Notion (date-only "YYYY-MM-DD" here). Empty → null. */
function readDate(page: NotionPageLike, name: string): string | null {
  const date = getProp(page, name, "date").date;
  return date === null ? null : date.start;
}

function readNumber(page: NotionPageLike, name: string): number | null {
  return getProp(page, name, "number").number;
}

function readUrl(page: NotionPageLike, name: string): string {
  const url = getProp(page, name, "url").url;
  if (!url) throw new MappingError(page.id, name, "is empty");
  return url;
}

function readRelationIds(page: NotionPageLike, name: string): string[] {
  const prop = getProp(page, name, "relation");
  // The API sends `has_more` on relation values, but the SDK type omits it.
  if ("has_more" in prop && prop.has_more === true) {
    // The page object holds at most 25 relations; more would need an extra
    // call. Not expected for this database, so fail loudly instead.
    throw new MappingError(page.id, name, "has more relations than returned");
  }
  return prop.relation.map((r) => r.id);
}

/**
 * Map one Notion page to an Item. Strict: a missing property, a wrong
 * property type, an unknown select option or an empty required value throws
 * an Error that names the property and the page id. Nothing is guessed.
 */
export function mapPage(page: NotionPageLike): Item {
  const order = readNumber(page, PROP.order);
  if (order === null) {
    throw new MappingError(page.id, PROP.order, "is empty");
  }
  if (!Number.isInteger(order) || order < 1) {
    throw new MappingError(
      page.id,
      PROP.order,
      `is not a positive integer (${order})`,
    );
  }

  return {
    id: page.id,
    title: readTitle(page, PROP.title),
    layer: readSelect(page, PROP.layer, LAYERS),
    author: readRichText(page, PROP.author),
    type: readSelect(page, PROP.type, ITEM_TYPES),
    link: readUrl(page, PROP.link),
    published: readDate(page, PROP.published),
    readingTimeMin: readNumber(page, PROP.readingTime),
    difficulty: readSelect(page, PROP.difficulty, DIFFICULTIES),
    priority: readSelect(page, PROP.priority, PRIORITIES),
    status: readSelect(page, PROP.status, STATUSES),
    whyRead: readRichText(page, PROP.whyRead),
    foundVia: readRichText(page, PROP.foundVia),
    pairedWith: readRelationIds(page, PROP.pairedWith),
    phase: readSelect(page, PROP.phase, PHASES),
    order,
    verified: getProp(page, PROP.verified, "checkbox").checkbox,
    addedIn: readSelect(page, PROP.addedIn, ADDED_IN),
    notes: readRichText(page, PROP.notes),
    doneOn: readDate(page, PROP.doneOn),
  };
}
