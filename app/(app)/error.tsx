"use client"; // Error boundaries must be Client Components

// Friendly error screen. Never shows the error message or a stack trace.
export default function AppError({ retry }: { error: Error; retry: () => void }) {
  return (
    <div className="state" role="alert">
      <h1 className="page-title">Something went wrong</h1>
      <p className="muted">We could not load your reading list. Please try again.</p>
      <button type="button" className="btn btn-primary" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
