"use client"; // Error boundaries must be Client Components

import { ScreenHeader } from "@/components/ScreenHeader";

// Friendly error screen. Never shows the error message or a stack trace.
export default function AppError({ retry }: { error: Error; retry: () => void }) {
  return (
    <>
      <ScreenHeader title="Error" />
      <div className="rr-screen__body">
        <section className="rr-state" role="alert">
          <h2 className="rr-phase-title">Something went wrong</h2>
          <p className="rr-body-italic">
            We could not load your reading list. Please try again.
          </p>
          <button
            type="button"
            className="rr-btn rr-btn--primary"
            onClick={() => retry()}
          >
            Try again
          </button>
        </section>
      </div>
    </>
  );
}
