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
- Card shows: Title, Author, Reading time, Difficulty, Phase, "Why read this", reading scope from `Notes` if it starts with "Read:".
- Big button **Open source** → `Link` in a new tab.
- Buttons: **Start** (hidden if already Reading), **Done**, **Skip**.
- If the item is in `5 · Counterweights`: show "This answers: <title(s) of Paired with>".
- Below: the next 3 items (title, reading time, layer chip).
- After an action, the screen refreshes to the new next item.

### 7.2 Path
- All items grouped by Phase (1→5), in `Order`.
- Each row: Order, Title, reading time, status chip (To read / Reading / Done / Skipped).
- Per phase: progress bar = hours Done / hours total (excluding Skipped), plus "x of y items".
- Phases collapsed except the current one (the phase of the Today item).
- Tap a row → small detail sheet with the same actions as Today.

### 7.3 Progress
- Hours read: total and this week.
- Bar chart: weekly hours, last 8 weeks, with a target line (default **5 h**, editable; store the target in `localStorage`, wrapped in try/catch).
- Hours by Layer (done vs total).
- Done items by Priority.
- Core completion % (Core hours done / Core hours total, excluding Skipped).
- Current streak (days).
- Projected finish date at last-4-weeks pace.

## 8. Access
- One password gate: form → compare with `APP_PASSWORD` on the server → set an httpOnly, secure cookie (30 days). All pages and server actions check it.

## 9. Design
- Mobile-first (iPhone width first), one clean layout, bottom tab bar: Today · Path · Progress.
- Dark/light follows the system. Large tap targets (≥44 px). No clutter.
- English UI, simple words (B1). Short labels.
- Fast: server-side fetch with short caching (e.g. revalidate 60 s) and revalidate immediately after any write.

## 10. Out of scope (v1)
Notes/summaries, quizzes, proposals inbox, multi-user, any login beyond the shared password, editing any property other than `Status` and `Done on`.

## 11. Done when
Deployed on Vercel; all three screens work on iPhone with the real Notion data; marking an item Done in the app updates `Status` and `Done on` in Notion.
