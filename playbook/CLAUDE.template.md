# CLAUDE.md — working rules for this repo

<!-- Fill every <…> and delete this comment. Keep it short: rules and facts, not prose. -->

## What this is
<One sentence: product, platforms, data source.> Full product spec: `SPEC.md`. Working method: `playbook/PLAYBOOK.md`. Read all three before any work.

## Stack
- <Framework + language (strict mode)>, deployed on <host>.
- <Data client>. Server side only.
- <Styling approach> in `design-system/`. <Charts/other: how, with no extra library unless approved.>
- Approved extra dependencies: <name> (approved by <owner>, <date>).

## Folder layout
```
<tree with one-line purpose per file/folder; update when it changes>
```

## Design system
- All UI follows `design-system/`. Read `design-system/README.md` before any UI work.
- Tokens and classes only. No hex literals, no new colours, no new fonts. Light and dark both supported.
- Phone layout is the reference; larger breakpoints only inside `@media (min-width: …)`.
- New components follow the "Adding a component" checklist.
- UI copy in simple English (B1).

## Where this runs
- Development in Claude Code on the web (cloud sandbox). No local machine.
- Secrets from the sandbox environment variables and <host> environment variables. Never from repo files.
- <Owner> tests on **preview URLs** on <device>. Each step: branch → push → what to check → wait for OK.
- Production = merge to `main`, only after <owner>'s OK <or: delegated to Claude after full test, date>.

## Commands
- `<lint>` — lint
- `<build>` — production build (must pass before every push)
- `<test>` — unit tests for all pure logic
- `<dev>` — quick checks inside the sandbox only

## Rules
- Never commit secrets. Only `.env.example` is committed. Never print secret values.
- No secret ever reaches the client.
- Use exact external names from `SPEC.md` §<n>. If something is missing or named differently, **stop and report**.
- The app writes only <fields>. Never create, delete or edit anything else.
- Always paginate external queries.
- No fake data, except fixtures inside tests.
- Ask before adding any dependency not listed above.
- Run lint, build and tests before saying a step is done. Show what works.
