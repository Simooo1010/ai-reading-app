// Fixture harness: renders the presentational components with made-up data
// and the design-system CSS into static HTML files, for screenshots of
// states the live data cannot show. Writes nothing to Notion.
//
// Run: npx vitest run --config tests/visual/vitest.config.mts
// Output: $VISUAL_OUT or tests/visual/out/ (git-ignored).

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "vitest";
import AppError from "@/app/(app)/error";
import { ActionButtons } from "@/components/ActionButtons";
import { PathView } from "@/components/PathView";
import { ProgressView } from "@/components/ProgressView";
import { TargetForm } from "@/components/WeeklyHours";
import { progressData } from "@/lib/progress";
import { SheetContent } from "@/components/SheetContent";
import { ScreenSkeleton } from "@/components/Skeleton";
import { TodayView, type ShelfPreview } from "@/components/TodayView";
import { UndoToast } from "@/components/UndoToast";
import type { CardData } from "@/lib/today";
import {
  PHASES,
  PLAIN,
  PROGRESS_ACTIVE,
  PROGRESS_FINISHED,
  PROGRESS_NONE,
  PROGRESS_THIS_WEEK_HIGH,
  PROGRESS_TODAY,
  READING_COUNTERWEIGHT,
  card,
} from "./fixtures";

const ROOT = resolve(__dirname, "../..");
const OUT = process.env.VISUAL_OUT ?? resolve(__dirname, "out");

function page(name: string, tab: "Today" | "Path" | "Progress", body: ReactNode, extra: ReactNode = null) {
  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{`Fixture: ${name}`}</title>
        {/* Static fixture file, not a Next.js page: load the font directly. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&display=swap" />
        <link rel="stylesheet" href={`file://${ROOT}/design-system/tokens.css`} />
        <link rel="stylesheet" href={`file://${ROOT}/design-system/components.css`} />
      </head>
      <body>
        <div className="rr-screen">
          <main className="rr-screen__main">{body}</main>
          <nav className="rr-tabbar" aria-label="Main">
            {(["Today", "Path", "Progress"] as const).map((t) => (
              <a key={t} className="rr-tabbar__tab" href="#" aria-current={t === tab ? "page" : undefined}>
                {t}
              </a>
            ))}
          </nav>
        </div>
        {extra}
      </body>
    </html>,
  );
  writeFileSync(`${OUT}/${name}.html`, `<!doctype html>${html}`);
}

function buttons(c: CardData, opts: Partial<Parameters<typeof ActionButtons>[0]> = {}) {
  return <ActionButtons status={c.status} allowReset={false} confirmSkip={false} busy={null} error={null} {...opts} />;
}

function sheet(name: string, c: CardData, opts: Partial<Parameters<typeof ActionButtons>[0]> = {}) {
  page(
    name,
    "Path",
    <PathView summary="8 items · 4.7 h" phases={PHASES} />,
    <dialog className="rr-sheet" aria-labelledby="sheet-title">
      <SheetContent card={c} actions={buttons(c, { allowReset: true, ...opts })} />
    </dialog>,
  );
}

const SHELF: ShelfPreview = {
  label: "PHASE 1 SHELF · 6 ITEMS · 2.3 H",
  spines: PHASES[0].rows.map((r) => ({ ...r, layer: r.layer })),
  nextId: PHASES[0].rows[3].id,
  following: "Fixture item 5",
  wall: PHASES.map((p, i) => ({ label: p.phase.toUpperCase(), current: i === 0, spines: p.rows })),
};

it("renders fixture pages", () => {
  mkdirSync(OUT, { recursive: true });
  const ctx = "Phase 1 · item 3 of 9";

  page("today-reading-counterweight", "Today",
    <TodayView context={ctx} card={READING_COUNTERWEIGHT} actions={buttons(READING_COUNTERWEIGHT)} streak="3 DAY STREAK" shelf={SHELF} />);
  page("today-skip-confirm", "Today",
    <TodayView context={ctx} card={PLAIN} actions={buttons(PLAIN, { confirmSkip: true })} streak="3 DAY STREAK" shelf={SHELF} />);
  page("today-action-error", "Today",
    <TodayView context={ctx} card={PLAIN} actions={buttons(PLAIN, { error: "Could not save. Please try again." })} streak="3 DAY STREAK" shelf={SHELF} />);
  page("today-undo-toast", "Today",
    <TodayView context={ctx} card={PLAIN} actions={buttons(PLAIN)} streak="3 DAY STREAK" shelf={SHELF} />,
    <UndoToast message="Skipped." pending={false} showClose={false} />);
  page("today-undo-error", "Today",
    <TodayView context={ctx} card={PLAIN} actions={buttons(PLAIN)} streak="3 DAY STREAK" shelf={SHELF} />,
    <UndoToast message="Could not save. Please try again." pending={false} showClose />);
  // Long author lists must wrap, never make the page wider than the phone.
  page("today-long-authors", "Today",
    <TodayView context={ctx} card={PLAIN} actions={buttons(PLAIN)} streak="3 DAY STREAK" shelf={SHELF} />);
  page("today-empty", "Today", <TodayView context="ALL DONE" streak={null} card={null} actions={null} shelf={null} />);
  page("today-loading", "Today", <ScreenSkeleton title="Today" variant="card" />);
  page("path-loading", "Path", <ScreenSkeleton title="Path" variant="list" />);
  // Sign in: same markup as app/login/page.tsx (the form is a client component
  // wired to a server action, so the static fixture draws its fields directly).
  page("login", "Today",
    <div className="rr-screen__body">
      <form className="rr-login">
        <div className="rr-cover rr-cover--closed" aria-hidden="true"><span className="rr-cover__title">AI Reading Path</span></div>
        <p className="rr-body">Enter the password to open your reading list.</p>
        <div className="rr-field">
          <label htmlFor="password" className="rr-field__label">Password</label>
          <input id="password" type="password" className="rr-field__input" aria-invalid="true" />
          <p className="rr-field__error" role="alert">That password is not right. Try again.</p>
        </div>
        <div className="rr-login__actions"><button type="button" className="rr-btn rr-btn--primary">Open</button></div>
      </form>
    </div>);
  page("error", "Today", <AppError error={new Error("fixture")} retry={() => {}} />);
  page("path-all-statuses", "Path", <PathView summary="8 items · 4.7 h" phases={PHASES} />);

  sheet("sheet-to-read", card({ status: "To read" }));
  sheet("sheet-reading", READING_COUNTERWEIGHT);
  sheet("sheet-done", card({ status: "Done", layer: "2 · Leaders", priority: "Optional", answers: [] }));
  sheet("sheet-skipped", card({ status: "Skipped", layer: "3 · Species", priority: "Recommended" }));
  sheet("sheet-skip-confirm", card({ status: "To read" }), { confirmSkip: true });

  const progress = (name: string, items: typeof PROGRESS_ACTIVE) =>
    page(name, "Progress", <ProgressView data={progressData(items, PROGRESS_TODAY)} />);
  progress("progress-active", PROGRESS_ACTIVE);
  progress("progress-this-week-high", PROGRESS_THIS_WEEK_HIGH);
  progress("progress-none", PROGRESS_NONE);
  progress("progress-finished", PROGRESS_FINISHED);
  progress("progress-empty", []);
  page("progress-loading", "Progress", <ScreenSkeleton title="Progress" variant="stats" />);
  page("progress-target-error", "Progress",
    <section className="rr-section">
      <div className="rr-section__head"><h2 className="rr-label">Hours per week</h2></div>
      <TargetForm inputId="t" errorId="t-err" value="99" error="Enter a number from 0.5 to 40." />
    </section>);
});
