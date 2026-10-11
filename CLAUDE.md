# CLAUDE.md — working rules for this repo

## What this is
AI Reading App: a mobile-first Next.js front end on top of the Notion database `AI Reading List`. Full product spec: `SPEC.md`. Read both files before any work.

## Stack
- Next.js (App Router) + TypeScript (strict), deployed on Vercel.
- `@notionhq/client` for data. Server side only (server components, route handlers, server actions).
- Plain CSS design system in `design-system/` (no Tailwind). Charts are inline SVG built from `lib/charts.ts` (no chart library).
- Print source (SPEC §7.4) uses `jsdom`, `@mozilla/readability` and `sanitize-html` (approved by Marcus 2026-10-10).

## Folder layout
```
app/
  layout.tsx                  # fonts + design-system CSS
  (app)/layout.tsx            # .rr-screen shell, tab bar, undo toast
  (app)/today/page.tsx
  (app)/path/page.tsx
  (app)/progress/page.tsx
  (app)/actions.ts            # server actions: start, done, skip, undo skip, back to To read
  (app)/error.tsx
  login/page.tsx, login/actions.ts
  print/[id]/page.tsx         # Print source (loading.tsx, error.tsx beside it); outside (app): no tab bar
proxy.ts                      # Next 16 name for middleware: redirects to /login without a valid rr_auth cookie (icons + manifest are public)
app/icon.svg, favicon.ico, apple-icon.png, manifest.ts   # app icon files; public/icons/ holds the master mark + manifest PNGs; see design-system/brand/README.md
lib/
  notion.ts        # client, paginated query, typed mapping, the only place that touches Notion
  types.ts         # Item type + Layer/Status/Priority/Phase unions with exact Notion labels
  auth.ts          # signed session cookie, password check, login throttle, requireAuth helpers
  stats.ts         # pure functions: hours, weeks, streak, projection (unit-tested)
  charts.ts        # pure SVG geometry for the Progress charts
  progress.ts, path.ts, today.ts   # pure view models for the three screens
  print/           # Print source: fetch (SSRF-safe), route/classify, load, cache, extract (substack, generic,
                   #   convert, sanitize, fidelity, text, meta, dom), pages/options/settings/format (print screen logic)
components/
  print/           # print screen (client): PrintClient, controls, pages, blocks, settings hook, fonts
design-system/
  tokens.css       # --rr- tokens + base layer (import first)
  components.css   # rr- component classes (import second)
  print.css        # print screen + paper output (the one documented exception to the two-colour rule)
  README.md        # how to use it, rules for new components
tests/             # vitest; tests/fixtures/print = saved real pages; tests/visual = fixture screenshots harness
vercel.json        # framework preset (the Vercel project preset was "Other")
```

## Design system
- All UI follows `design-system/` ("Reading Room"). Read `design-system/README.md` before any UI work.
- Use only `--rr-` tokens and `rr-` classes. No hex literals, no new colours, no sans fonts.
- New components not in the designs must follow the "Adding a component" checklist in the README.
- UI copy in simple English (B1).

## Where this runs
- Development happens in Claude Code on the web (cloud sandbox). There is no local machine.
- Secrets come from the cloud environment's variables (sandbox) and from Vercel's environment variables (Preview + Production). Never from files in the repo.
- Marcus tests on Vercel **preview URLs** on his iPhone. Each step: work on a branch, push, give him what to check on the preview, wait for his OK.
- Production = merge to `main`. Marcus delegated that merge to Claude once the finished app has passed the full test (code review, live use, visual check), 2026-10-10.

## Commands
- `npm run lint` — ESLint
- `npm run build` — production build (must pass before every push)
- `npm test` — unit tests for all of `lib/` (stats, path, today, progress, charts, auth, proxy, print…) and the print screen logic
- `npm run dev` — only for quick checks inside the sandbox; Marcus can't open it

## Rules
- Never commit secrets. `.env*.local` stays in `.gitignore`. Only `.env.example` is committed. Never print secret values in output.
- Never expose `NOTION_TOKEN` to the client. No `NEXT_PUBLIC_` prefix on any secret.
- Use the exact Notion property names and option labels from `SPEC.md` §4. If a property is missing or named differently in the live database, **stop and report** — do not guess or rename.
- The app writes only `Status` and `Done on`. Never create, delete or edit other properties or items.
- Always paginate Notion queries (the database has >100 rows).
- No fake data, except fixtures inside tests.
- Ask before adding any dependency beyond Next.js, `@notionhq/client`, and the three Print libraries above (dev tooling like ESLint/test runner excepted). There is no chart library.
- Run `npm run lint` and `npm run build` (and `npm test` once tests exist) before saying a step is done. Show what works.
- Keep UI text in simple English (B1).
