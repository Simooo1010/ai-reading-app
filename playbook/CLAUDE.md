# CLAUDE.md — working rules for this repo

<!-- TEMPLATE. Fill every <…>, delete unused options, delete this comment. Keep this file short: facts and rules only. -->

## What this is
<One sentence: product, platforms, data source.>
- Product spec: `docs/SPEC.md`
- Working method: `docs/WORKFLOW.md` — **read it before any work, every session.**
- Owner-only setup steps: `SETUP-FOR-OWNER.md`

## Project settings
- **Owner:** <name>
- **Approval mode:** <Strict | Milestone | Autonomous> (definitions in `docs/WORKFLOW.md` §3)
- **Milestones** (Milestone mode only): <Steps 1–3, Steps 4–5, …>
- **Production merge:** needs owner OK. <Or: delegated to Claude after all QA gates pass — <owner>, <date>.>
- **Test device(s):** <e.g. iPhone, Safari>
- **Supported:** <themes: light/dark?> · <sizes: phone/tablet/desktop?>
- **Design system:** <path and README to read before UI work, or "none">

## Stack
- <Framework + language, strict mode>, deployed on <host>.
- <Data source / client>. Credentials used on the server only.
- **Approved dependencies:** <framework>, <client>. Extra: <name> (approved by <owner>, <date>).

## Folder layout
```
<tree, one-line purpose per entry. Update in the same commit that changes it.>
```

## Commands
- `<lint>` — lint
- `<build>` — production build (must pass before every push)
- `<test>` — unit tests
- `<dev>` — quick checks inside the sandbox only

## Where this runs
- Development in Claude Code on the web (cloud sandbox). No local machine.
- Secrets: sandbox environment variables + <host> environment variables. Never in repo files.
- Owner tests on **preview URLs** on the test device.

## Hard rules
- Never commit secrets. Only `.env.example` is committed. Never print secret values.
- No secret reaches the client (no public env prefix on secrets).
- Use the exact external names in `docs/SPEC.md` §Data. If something is missing or named differently: **stop and report**. Never guess or rename.
- The app writes only: <fields/resources>. Never create, delete or edit anything else.
- Always paginate external queries.
- No fake data, except fixtures inside tests.
- Ask before adding any dependency not listed above; record approvals here.
- Run lint, build and tests before saying a step is done. Show the output.
- Never start the next step or merge beyond what the approval mode allows.
