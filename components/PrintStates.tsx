import type { ReactNode } from "react";
import { ArrowUpRightIcon } from "@/components/Icons";
import { ScreenHeader } from "@/components/ScreenHeader";

// Server-rendered screens of the print route that are not the print view
// itself: loading, open PDF, error, not found. No tab bar (the print page
// lives outside the (app) group), same column as the rest of the app.

export function PrintShell({ context, children }: { context?: string; children: ReactNode }) {
  return (
    <div className="rr-screen">
      <main className="rr-screen__main">
        <ScreenHeader title="Print" context={context} />
        <div className="rr-screen__body">{children}</div>
      </main>
    </div>
  );
}

/** Loading: wash blocks + one honest line. No fake data. */
export function PrintSkeleton() {
  return (
    <PrintShell>
      <section className="rr-state" aria-busy="true">
        <p className="rr-body-italic" role="status">
          Getting the page…
        </p>
        <div className="rr-skeleton-group" aria-hidden="true">
          <span className="rr-skeleton rr-skeleton--title" />
          <span className="rr-skeleton rr-skeleton--short" />
          <span className="rr-skeleton rr-skeleton--rule" />
          <span className="rr-skeleton" />
          <span className="rr-skeleton" />
          <span className="rr-skeleton rr-skeleton--short" />
          <span className="rr-skeleton rr-skeleton--button" />
        </div>
      </section>
    </PrintShell>
  );
}

type Action = { href: string; label: string };

/** Title + B1 message + one primary action (new tab) + a link back. */
export function PrintMessage({
  context,
  title,
  message,
  primary,
  back,
  alert = false,
}: {
  context?: string;
  title?: string;
  message: string;
  primary?: Action | null;
  back: Action;
  alert?: boolean;
}) {
  return (
    <PrintShell context={context}>
      <section className="rr-state">
        {title && <h2 className="rr-phase-title">{title}</h2>}
        <p className="rr-body" role={alert ? "alert" : undefined}>
          {message}
        </p>
        <div className="rr-print-state__actions">
          {primary && (
            <a className="rr-btn rr-btn--primary" href={primary.href} target="_blank" rel="noopener noreferrer">
              {primary.label}
              <span className="rr-sr-only"> (opens in a new tab)</span>
              <ArrowUpRightIcon />
            </a>
          )}
          <a className="rr-btn rr-btn--link" href={back.href}>
            {back.label}
          </a>
        </div>
      </section>
    </PrintShell>
  );
}
