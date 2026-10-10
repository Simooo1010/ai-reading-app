"use client"; // Error boundaries must be Client Components

import { ScreenHeader } from "@/components/ScreenHeader";

// Friendly error screen (e.g. Notion is down). Never shows the error message.
export default function PrintError({ retry }: { error: Error; retry: () => void }) {
  return (
    <div className="rr-screen">
      <main className="rr-screen__main">
        <ScreenHeader title="Print" />
        <div className="rr-screen__body">
          <section className="rr-state" role="alert">
            <h2 className="rr-phase-title">Something went wrong</h2>
            <p className="rr-body-italic">We could not open this page. Please try again.</p>
            <div className="rr-print-state__actions">
              <button type="button" className="rr-btn rr-btn--primary" onClick={() => retry()}>
                Try again
              </button>
              <a className="rr-btn rr-btn--link" href="/today">
                Back to Today
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
