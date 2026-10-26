# Project Playbook — how to build with Claude Code, precisely

Distilled from the AI Reading App build (Notion → Next.js → Vercel, 2026). Drop this folder into any repo, fill in `CLAUDE.template.md`, rename it `CLAUDE.md`, and point Claude at both files in the first message.

---

## 0. The core idea

Claude works best as a **contractor against written documents**, not as a chat partner improvising. Everything below follows from three rules:

1. **Written source of truth beats memory.** Spec, rules and design system live in files in the repo. Chat decisions get written back into them the same day.
2. **Small verified steps beat big leaps.** Each step is buildable, testable and reviewable on its own, on its own branch.
3. **The owner checks real behaviour, not code.** Every step ends with "here is what to check on the preview", and nothing advances without an explicit OK.

---

## 1. The document set (create before any code)

| File | Purpose | Who changes it |
|---|---|---|
| `SPEC.md` | What the product does: screens, data model with **exact** field names/labels, behaviours, edge cases, a numbered **build order**. | Owner approves; Claude proposes edits as separate "SPEC:" commits. |
| `CLAUDE.md` | How Claude must work here: stack, folder layout, commands, hard rules, where secrets live, how testing/approval works. | Updated whenever a rule or the layout changes. |
| `design-system/README.md` (+ tokens) | Visual rules: tokens, components, breakpoints, "adding a component" checklist. | Changed only by an explicit design step. |
| `SETUP-FOR-<OWNER>.md` | Plain-language steps only the human can do (accounts, env vars, connectors). | Claude writes; owner follows. |

Rules for the spec:
- Name things **exactly** as they exist in the external system (DB property names, option labels). If reality differs from the spec → **stop and report**, never guess or rename.
- Section numbers (`§7.4`) so commits, PRs and chats can cite them.
- A "build order" section: numbered steps, each one shippable.
- Decisions with a date and an owner ("approved by X, 2026-10-10") so later sessions don't re-litigate them.

---

## 2. The step loop (repeat for every build-order step)

```
read SPEC + CLAUDE.md → clarify → branch → build → verify → push → draft PR
   → preview URL + check list → owner tests on device → fix → OK → merge → next step
```

1. **Read first.** Claude re-reads `SPEC.md`, `CLAUDE.md` and the relevant README before touching anything — every session, because sessions start cold.
2. **Clarify before building.** Ambiguities go to the owner as multiple-choice questions (AskUserQuestion), with a recommended option. Ask once, up front, not drip-fed.
3. **One branch per step.** Commit messages name the step: `Step 4: Progress screen (…)`, `Print step 6a part 2: …`. Big steps split into parts (6a part 1, 6a part 2, 6b…).
4. **Pure logic first, UI second.** Calculations live in pure, unit-tested modules (`lib/stats.ts`, `lib/charts.ts`); screens only render view models. This is what made the app precise: every number on screen has a test behind it.
5. **Verify before claiming done.** `lint` + `build` + `test` must pass before every push. "Done" means: shown working, with output — not "should work".
6. **Hand-off message** at the end of each step:
   - Preview URL
   - A short, numbered **"what to check"** list written for a phone, in plain words
   - What is *not* in this step (so missing things aren't mistaken for bugs)
   - Any open question
7. **Wait for the OK.** No stacking of new steps on unapproved work.

---

## 3. Quality gates (in order of cost)

1. **Automated:** lint, typecheck/build, unit tests. Every push.
2. **Real-data run:** test against the real inputs, not just fixtures (e.g. "Print: fixes from running all 189 real links"). Save representative real samples as test fixtures.
3. **Code review pass:** a separate review (subagent or `/code-review`) before release; fixes land as their own commit ("Fixes from the code review").
4. **Final QA:** full walkthrough on the target device; fixes as "Fixes from the final QA".
5. **Visual check:** screenshot harness for UI-heavy features, light + dark, phone + tablet + desktop.

Release to production only after all five. If the owner delegates the merge, write that delegation and its conditions into `CLAUDE.md`.

---

## 4. Hard rules worth copying verbatim

- Secrets only in environment variables (cloud sandbox + hosting provider). Never in the repo, never printed in output, never with a client-exposed prefix.
- The app writes **only** the fields it is meant to write. List them explicitly.
- Always paginate external API queries.
- No fake data outside test fixtures.
- Ask before adding any dependency not already approved; record approvals with name + date.
- Server-only access to third-party credentials.
- Stop and report when reality contradicts the spec.

---

## 5. Design-system discipline

- Tokens only (`--prefix-` variables, `prefix-` classes). No hex literals, no ad-hoc colours or fonts.
- Light and dark from day one: every colour from a token.
- Mobile layout is the reference; larger breakpoints only inside `@media (min-width: …)` blocks — phone stays untouched.
- New components follow a written checklist (states, both themes, all breakpoints, accessibility, documented in the README).
- One documented exception at most (e.g. print paper is always black on white) — written down, not implicit.

---

## 6. Communication style

- Owner-facing copy (UI, check lists, setup docs) in simple language (B1).
- Claude reports outcomes faithfully: failing tests are shown, skipped steps are named.
- Short status lines while working; the record lives in commits, PRs and docs, not in chat.
- PR titles describe the user-visible change ("Tab bar fits iPhone Safari: smaller bottom gap…"), not the code.

---

## 7. Automation and agents

- **Cloud sessions:** development happens in Claude Code on the web; the owner tests preview deployments on their phone. No local machine needed.
- **Draft PRs** for every pushed branch; Claude can subscribe to PR activity to fix CI and answer review comments.
- **Subagents** (only when it pays off): cheap/fast models for read-only research and sweeps; the strongest model for building, verifying and fixing. Effort capped at *high*. Independent subagents in parallel.
- **Tests as the memory of correctness:** every bug fixed gets a test, so later sessions can't silently regress it.

---

## 8. Kick-off prompt for a new project

> Read `playbook/PLAYBOOK.md` and `CLAUDE.md`. We will work exactly this way. First, interview me (use multiple-choice questions) until you can write `SPEC.md` with exact data names, screens, edge cases and a numbered build order. Do not write code until I approve the spec. Then fill in the placeholders in `CLAUDE.md`, write `SETUP-FOR-ME.md` for the steps only I can do, and start Step 1 on its own branch.

## 9. Per-step prompt

> Next: Step N from SPEC §12. Re-read SPEC and CLAUDE.md, ask what's unclear, then build it on a branch. Before pushing: lint, build, test. Give me the preview URL and what to check on my phone.
