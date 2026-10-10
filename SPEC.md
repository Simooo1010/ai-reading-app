# AI Reading App — Product Spec (v1)

## 1. Purpose
A small mobile-first web app that tells Marcus what to read next in his AI reading path and shows his progress and pace. It is a front end on top of one Notion database. **Notion is the only source of truth. The app has no database of its own.**

## 2. User
- Marcus, 19, non-native English (B1), reads 3–7 hours/week, mostly on iPhone.
- Single user. Access is protected by one shared password (`APP_PASSWORD`).

## 3. Stack (fixed)
- Next.js (App Router) + TypeScript, deployed on Vercel.
- `@notionhq/client` for all data access, **server side only** (token never reaches the browser).
- One small chart library for the Progress screen.
- Built in Claude Code on the web (cloud) from a GitHub repo; tested on Vercel preview URLs; production = `main`.

## 4. Data source — Notion database `AI Reading List`
- Database ID: `0c79d5a9-ee16-4798-81de-b5a23142ebb5` (also set via `NOTION_DATABASE_ID`).
- Captured from the live database on 2026-10-10. **Use these names and option labels exactly** (case, spaces and the `·` character included).

| Property | Notion type | Options / notes |
|---|---|---|
| `Title` | title | — |
| `Layer` | select | `1 · Foundations`, `2 · Leaders`, `3 · Species`, `4 · Frontier essays`, `5 · Counterweights` (separator is U+00B7 `·`) |
| `Author` | rich_text | — |
| `Type` | select | `Essay`, `Paper`, `Report`, `Book`, `Book chapter`, `Newsletter issue`, `Article`, `Talk transcript` |
| `Link` | url | opens the source |
| `Published` | date | **may be empty** (25 items have no date) |
| `Reading time (min)` | number | integer minutes |
| `Difficulty` | select | `Easy`, `Medium`, `Hard` |
| `Priority` | select | `Core`, `Recommended`, `Optional` |
| `Status` | **select** (not Notion "status" type) | `To read`, `Reading`, `Done`, `Skipped` |
| `Why read this` | rich_text | ≤40 words |
| `Found via` | rich_text | — |
| `Paired with` | relation (self, one-way) | set on Layer 5 items, points to the item(s) they answer |
| `Phase` | select | options `Phase 1`…`Phase 6`; **only Phase 1–5 are used** |
| `Order` | number | global reading order, 1…189, unique, no gaps |
| `Verified` | checkbox | all true |
| `Added in` | select | `Chat 2`…`Chat 6`, `Chat 9` |
| `Notes` | rich_text | may contain reading scope, e.g. "Read: abstract, intro, conclusion" — show it on the Today card when present |
| `Done on` | date | **added 2026-10-10 for this app.** Empty on all items today |

### Current data snapshot (2026-10-10)
- 189 items, all `Status = To read`, ~89.2 h total.
- By Layer: Foundations 15 (5.2 h) · Leaders 22 (16.1 h) · Species 110 (50.1 h) · Frontier essays 32 (11.1 h) · Counterweights 10 (6.8 h).
- By Phase: P1 13 (6.9 h) · P2 54 (28.1 h) · P3 17 (15.3 h) · P4 54 (19.8 h) · P5 51 (19.2 h).
- By Priority: Core 43 (29.8 h) · Recommended 57 (22.8 h) · Optional 89 (36.6 h).
- More than 100 items → **Notion queries must paginate** (`has_more` / `next_cursor`).

### Sample rows (real)
1. Order 1 · Phase 1 · `The Bitter Lesson` — Rich Sutton · Essay · `1 · Foundations` · Core · Easy · 10 min · Published 2019-03-13 · http://www.incompleteideas.net/IncIdeas/BitterLesson.html
2. Order 3 · Phase 1 · `Deep Learning Is Hitting a Wall` — Gary Marcus · Article · `5 · Counterweights` · Core · Easy · 30 min · Published 2022-03-10 · Paired with → `Will scaling work?`, `Three Observations` · https://nautil.us/deep-learning-is-hitting-a-wall-238440/
3. Order 11 · Phase 1 · `The AI Revolution: The Road to Superintelligence` — Tim Urban · Essay · `3 · Species` · Recommended · Easy · 55 min · Published 2015-01-22 · Found via "This Will Be My Most Disliked Video On YouTube" · https://waitbutwhy.com/2015/01/artificial-intelligence-revolution-1.html

## 5. Write rules (the app may change only two properties)
- The app **never creates or deletes items** and never edits any property except `Status` and `Done on`.
- `Status` → `Done`: set `Done on` = today (date only, Europe/Rome).
- `Status` leaves `Done` (to anything else): clear `Done on`.
- `Start` → `Status = Reading`. `Skip` → `Status = Skipped` (with a confirm step; offer Undo for a few seconds).
- `Back to To read` (Path detail sheet) → `Status = To read`; if the item was `Done`, `Done on` is cleared. Only `Status` and `Done on` change.

## 6. Calculation rules
- **Hours read** = sum of `Reading time (min)` of items with `Status = Done`, ÷ 60.
- `Skipped` items are excluded from all totals, percentages and projections (both numerator and denominator).
- A week runs Monday–Sunday, Europe/Rome. An item counts in the week of its `Done on`.
- **Streak** = consecutive days up to today (or yesterday, if nothing done yet today) with at least one item `Done on` that day.
- **Projected finish** = remaining hours (non-Done, non-Skipped) ÷ average weekly hours of the last 4 weeks. If that average is 0, show "Not enough data yet".
- Items with `Done` but empty `Done on` (e.g. edited directly in Notion) count in totals but not in weekly charts/streak.

## 7. Screens

### 7.1 Today (home)
- **Next item** = lowest `Order` with `Status` in {`Reading`, `To read`}. (A `Reading` item is naturally picked if it is lowest; do not reorder.)
- Header context: "Phase N · item X of T" (N = phase of the next item, X = its `Order`, T = all items in the database); "All done" when there is no next item.
- Card shows: Layer chip (+ Core mark; a Reading chip when the item is Reading), Title, "by Author", meta line Type · Reading time · Difficulty · Phase, "Why read this", reading scope from `Notes` if it starts with "Read:" (italic line under "Why read this").
- Big button **Open source** → `Link` in a new tab (thin arrow icon).
- Buttons: **Start** (play icon; hidden if already Reading), **Done** (check icon), **Skip** (quiet text button; inline confirm "Skip this item?" then an Undo toast for 6 s).
- If the item is in `5 · Counterweights`: show "This answers: <title(s) of Paired with>" (italic line under "Why read this").
- Below: "Up next", the next 0–3 real items (order, title, author · reading time, layer chip). No placeholder rows.
- After an action, the screen refreshes to the new next item.

### 7.2 Path
- All items grouped by Phase (1→5), in `Order`.
- Each row: Order, Title, reading time, status chip (To read / Reading / Done / Skipped).
- Header context: "<non-Skipped items> items · <their hours, 1 decimal> h".
- Every phase that has items is shown, in phase order (none is dropped).
- Per phase: progress bar = hours Done / hours total (excluding Skipped), plus "x of y items done" (y = non-Skipped items), with " · N skipped" added only when N > 0, and "done of total h".
- Phases collapsed except the current one (the phase of the Today item; it is marked "Now"). None is open when everything is done.
- Tap a row → detail sheet (bottom sheet) with the same card as Today and actions by status: To read → Start, Done, Skip · Reading → Done, Skip, Back to To read · Done → Back to To read · Skipped → Back to To read. Esc or "Close" closes it. After Skip the sheet closes and the Undo toast shows.

### 7.3 Progress
- Hours read: total and this week.
- Bar chart: weekly hours, last 8 weeks, with a target line (default **5 h**, editable; store the target in `localStorage`, wrapped in try/catch).
- Hours by Layer (done vs total).
- Done items by Priority.
- Core completion % (Core hours done / Core hours total, excluding Skipped).
- Current streak (days).
- Projected finish date at last-4-weeks pace.

### 7.4 Print source (function "Print")

**Goal.** From any source, give Marcus a clean A4 printout (or PDF) with all of its text and none of the clutter. Read-only: it never writes to Notion (§5 is unchanged).

**Place in the build.** After the new design is applied to the app (it uses the new design, not the current screens). Build order: new design → Print → deploy checks. The extraction code in `lib/print/` has no UI and can be built before the design lands.

**Used sometimes, not always.** Print is a quiet, secondary feature:
- It is a small option on each source, not a main button: a small icon or "⋯" menu entry on the Today card, on Path rows and in the Path detail sheet. It must never compete with Open source, Start, Done or Skip.
- It costs nothing until used: no background fetching, no extra Notion calls, no effect on how fast Today loads. Its code loads only on the print page.
- It remembers the last customization in `localStorage` (try/catch, per §7.3), so a rare use is still quick.

**Origin and rule of reuse.** Inspired by Marcus's tool Pressroom (`pressroom.onrender.com`, repo `Simooo1010/pressroom-2`). We reuse its *mechanism*, not its look or its code layout. The print page is rebuilt in this app's design and in this app's stack.

Pressroom's mechanism:
1. The server downloads the page and extracts it to structured content: title, subtitle, author, date, hero image, and an ordered list of elements (paragraph, heading, blockquote, pullquote, image, list, code, table, separator, embed). Inline formatting stays in the text.
2. The browser renders that content with a format and the user's options.
3. The browser builds real A4 pages itself: it measures each block, packs blocks onto pages, and keeps headings and lead-in lines (ending with ":") with what follows. Figures never split.
4. Print CSS hides all UI, `@page` is A4 with zero margin, each page ends with a page break, `document.title` is set to the article title (so the PDF gets a good file name), then `window.print()`.

**Do not depend on Pressroom as a service.** Its server runs on a free Render plan that sleeps when idle and needs about a minute to wake (to be confirmed on Marcus's plan). The extraction runs inside this app.

**What not to copy from Pressroom** (found by reading its code):
- It merges consecutive short paragraphs (under 160 characters) into one. This changes the author's text structure (poems, dialogue, one-line paragraphs). We keep paragraphs exactly as the source has them.
- It silently prints only the free preview of paywalled posts. We detect this and say so.
- Headings lose inline links and formatting.
- Unknown elements become plain paragraphs with no report; there is no completeness check.
- Its parse endpoint fetches any URL it is given. We only fetch URLs that come from the Notion `Link` property, allow only http(s), block private or local addresses, and set a timeout and a size limit.
- Its Puppeteer PDF endpoint is not used by its own front end. We do not build it.

**Coverage: every non-PDF source.** Print works for all sources that are web pages. Real data (189 links, checked 2026-10-10):

| Kind | Items | How Print works |
|---|---|---|
| Substack (19 on substack.com, 32 on custom domains) | 51 | Extract and render (Substack-aware: free content area, widgets removed) |
| Other web pages | 72 | Extract and render (generic article extraction) |
| arXiv abstract pages (all `Paper`) | 51 | Print the paper's HTML version (`arxiv.org/html/<id>`) when it exists; otherwise offer to open the PDF (`arxiv.org/pdf/<id>`). The abstract page alone is never printed as if it were the paper. |
| Direct PDF links | 15 | No processing. The option reads "Open PDF" (a PDF is already print-ready). |

Whether the arXiv HTML version exists for each paper is not verified yet; older papers often have none, so the PDF fallback matters.

Known hard pages (show "may not print well" before the user starts): interactive sites (`ai-2027.com`, `situational-awareness.ai`, `intelligence-curse.ai`), landing pages whose real text sits behind a link (`nber.org`, `papers.nips.cc`), publisher pages (`academic.oup.com`), and site roots (`swarmtraces.org`).

**Customization: all of Pressroom's options**
- **Format:** Default and Monospace (the two simplest; others can be added later with the same registry).
- **Font:** Format default, Modern Sans (Inter), Classic Serif (Lora), Times New Roman, Typewriter.
- **Size:** 8–36 pt (default 12).
- **Line spacing:** 1.0–3.0 (default 1.6).
- **Margin:** 0–80 mm (default 25).
- **Exclude video embeds:** on/off.
- **Remove single images:** a tap on an image removes it from the printout (and back).
- **Print / Save as PDF** button, with the tip: set margins to "None" in the print dialog.
- Not carried over: Pressroom's "latest N posts from a publication" mode and its own light/dark toggle (this app follows the system).

The controls look like the rest of this app. Pressroom's own styling is not copied.

**Fidelity rules ("no bugs, truthfully")**
1. Nothing is dropped silently. Before printing, a check line shows words found on the page against words printed, and images, tables and code blocks kept against found.
2. An element we cannot print becomes a visible placeholder with its link, for example "[Video not printed: <link>]".
3. Paywall or login wall detected, or the extracted text is far too short for the page: no half-clean page. Show a clear message and an **Open source** button.
4. Generic extraction can remove real content by mistake, so the check in rule 1 compares against the full page text, not against what the extractor kept.
5. Every printout ends with title, author, date and the source URL.
6. Content from outside is sanitized before it reaches the page (no scripts, no event handlers).
7. Parsed articles are cached per URL (about 24 h). A failed parse is not cached.

**Acceptance tests.** Saved real pages as test fixtures (fixtures in tests are allowed): at least 5 Substack posts (one with images, one with a table or code, one with a video embed, one paywalled), 5 non-Substack pages from the real list, 2 arXiv items (one with an HTML version, one without) and 2 PDF items. For each page fixture the printed word count is within 2 % of the source word count, or the check line says why not. Plus unit tests for URL rewriting, the paragraph-structure guarantee, the paywall and too-short detection, and the page-packing rules (heading stays with the next block, figure does not split).

**Dependencies (approved by Marcus 2026-10-10).** `jsdom`, `@mozilla/readability`, `sanitize-html`. `cheerio` is not needed (jsdom does the same job), so the list stays at the three approved.

**Out of scope for Print v1.** Substack Notes, "latest N posts from a publication" mode, the four other Pressroom formats (Newspaper, Scientific, Book, Magazine), saving PDFs on the server.

## 8. Access
- One password gate: form → compare with `APP_PASSWORD` on the server → set an httpOnly, secure cookie (30 days). All pages and server actions check it.

## 9. Design
- Visual model: the Reading Room design system (`design-system/`). Mobile-first (iPhone width first): one centred column, fluid up to 480 px, the same column on all widths (no separate desktop layout).
- Bottom tab bar with text-only tabs: Today · Path · Progress.
- Light theme only for now (a dark theme is not designed yet). Large tap targets (≥44 px). No clutter.
- English UI, simple words (B1). Short labels.
- Fast: server-side fetch with short caching (e.g. revalidate 60 s) and revalidate immediately after any write.

## 10. Out of scope (v1)
Notes/summaries, quizzes, proposals inbox, multi-user, any login beyond the shared password, editing any property other than `Status` and `Done on`.

## 11. Done when
Deployed on Vercel; all three screens work on iPhone with the real Notion data; marking an item Done in the app updates `Status` and `Done on` in Notion.
