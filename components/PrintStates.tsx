import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRightIcon } from "@/components/Icons";
import { PrintBackLink } from "@/components/PrintBackLink";
import { ScreenHeader } from "@/components/ScreenHeader";
import { safeHttpUrl } from "@/lib/links";

// Server-rendered screens of the print route that are not the print view
// itself: loading, open PDF, error, not found. No tab bar (the print page
// lives outside the (app) group), the narrow phone column on every width.

export function PrintShell({ context, children }: { context?: string; children: ReactNode }) {
  return (
    <div className="rr-screen rr-screen--narrow">
      <main className="rr-screen__main">
        <ScreenHeader title="Print" context={context} />
        <div className="rr-screen__body">{children}</div>
      </main>
    </div>
  );
}

/** Loading: wash blocks + one honest line + a way back. No fake data. */
export function PrintSkeleton() {
  return (
    <PrintShell>
      <section className="rr-state" aria-busy="true">
        <p className="rr-body-italic" role="status">
          Getting the page…
        </p>
        {/* Loading can take up to ~15 s; the home screen app has no browser Back. */}
        <div className="rr-print-state__actions">
          <PrintBackLink />
        </div>
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
  // The primary action opens an outside page: http(s) only, else no button.
  const primaryHref = primary ? safeHttpUrl(primary.href) : null;
  return (
    <PrintShell context={context}>
      <section className="rr-state">
        {title && <h2 className="rr-phase-title">{title}</h2>}
        <p className="rr-body" role={alert ? "alert" : undefined}>
          {message}
        </p>
        <div className="rr-print-state__actions">
          {primary && primaryHref && (
            <a className="rr-btn rr-btn--primary" href={primaryHref} target="_blank" rel="noopener noreferrer">
              {primary.label}
              <span className="rr-sr-only"> (opens in a new tab)</span>
              <ArrowUpRightIcon />
            </a>
          )}
          <Link className="rr-btn rr-btn--link" href={back.href} prefetch={false}>
            {back.label}
          </Link>
        </div>
      </section>
    </PrintShell>
  );
}
