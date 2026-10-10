# CLAUDE.md — working rules for this repo

## What this is
AI Reading App: a mobile-first Next.js front end on top of the Notion database `AI Reading List`. Full product spec: `SPEC.md`. Read both files before any work.

## Stack
- Next.js (App Router) + TypeScript (strict), deployed on Vercel.
- `@notionhq/client` for data. Server side only (server components, route handlers, server actions).
- One small chart library for the Progress screen (e.g. Recharts). Plain CSS or Tailwind — pick one and stay consistent.

## Folder layout
```
app/
  (app)/today/page.tsx
  (app)/path/page.tsx
  (app)/progress/page.tsx
  login/page.tsx
  layout.tsx
lib/
  notion.ts        # client, paginated query, typed mapping, the only place that touches Notion
  types.ts         # Item type + Layer/Status/Priority/Phase unions with exact Notion labels
  stats.ts         # pure functions: hours, weeks, streak, projection (unit-tested)
  auth.ts          # password gate helpers
components/
design-system/
  tokens.css       # --rr- tokens + base layer (import first)
  components.css   # rr- component classes (import second)
  README.md        # how to use it, rules for new components
middleware.ts      # redirects to /login without the auth cookie
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
- Production = merge to `main`.

## Commands
- `npm run lint` — ESLint
- `npm run build` — production build (must pass before every push)
- `npm test` — unit tests for `lib/stats.ts`
- `npm run dev` — only for quick checks inside the sandbox; Marcus can't open it

## Rules
- Never commit secrets. `.env*.local` stays in `.gitignore`. Only `.env.example` is committed. Never print secret values in output.
- Never expose `NOTION_TOKEN` to the client. No `NEXT_PUBLIC_` prefix on any secret.
- Use the exact Notion property names and option labels from `SPEC.md` §4. If a property is missing or named differently in the live database, **stop and report** — do not guess or rename.
- The app writes only `Status` and `Done on`. Never create, delete or edit other properties or items.
- Always paginate Notion queries (the database has >100 rows).
- No fake data, except fixtures inside tests.
- Ask before adding any dependency beyond Next.js, `@notionhq/client` and one small chart library (dev tooling like ESLint/test runner excepted).
- Run `npm run lint` and `npm run build` (and `npm test` once tests exist) before saying a step is done. Show what works.
- Keep UI text in simple English (B1).
