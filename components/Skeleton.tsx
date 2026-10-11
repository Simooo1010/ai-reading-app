import { ScreenHeader } from "@/components/ScreenHeader";

/**
 * Loading state: header + neutral wash blocks (no text, no fake data).
 * On a phone it is one column. From md up the blocks follow the grids of the
 * real screens (.rr-today, .rr-path, .rr-progress-grid), so nothing jumps
 * when the data arrives: each .rr-skeleton-cell is one grid cell there and
 * "disappears" (display: contents) on a phone.
 */
export function ScreenSkeleton({
  title,
  variant,
}: {
  title: string;
  variant: "card" | "list" | "stats";
}) {
  return (
    <>
      <ScreenHeader title={title} />
      <div className="rr-screen__body" aria-busy="true">
        <span className="rr-sr-only" role="status">
          Loading
        </span>
        {variant === "card" ? (
          <div className="rr-today" aria-hidden="true">
            <div className="rr-skeleton-group">
              <span className="rr-skeleton rr-skeleton--chip" />
              <span className="rr-skeleton rr-skeleton--title" />
              <span className="rr-skeleton rr-skeleton--short" />
              <span className="rr-skeleton" />
              <span className="rr-skeleton rr-skeleton--rule" />
              <span className="rr-skeleton" />
              <span className="rr-skeleton rr-skeleton--short" />
              <span className="rr-skeleton rr-skeleton--button" />
            </div>
            {/* "Up next" column: wide screens only */}
            <div className="rr-skeleton-group rr-skeleton-aside">
              <span className="rr-skeleton rr-skeleton--rule" />
              <span className="rr-skeleton rr-skeleton--short" />
              <span className="rr-skeleton" />
              <span className="rr-skeleton rr-skeleton--short" />
              <span className="rr-skeleton" />
            </div>
          </div>
        ) : variant === "stats" ? (
          <div
            className="rr-skeleton-group rr-skeleton-grid rr-skeleton-grid--stats"
            aria-hidden="true"
          >
            <div className="rr-skeleton-cell">
              <span className="rr-skeleton rr-skeleton--short" />
              <span className="rr-skeleton rr-skeleton--title" />
            </div>
            <div className="rr-skeleton-cell">
              <span className="rr-skeleton rr-skeleton--rule" />
              <span className="rr-skeleton rr-skeleton--short" />
              <span className="rr-skeleton rr-skeleton--rule" />
            </div>
            <div className="rr-skeleton-cell">
              <span className="rr-skeleton rr-skeleton--chart" />
            </div>
            <div className="rr-skeleton-cell">
              <span className="rr-skeleton rr-skeleton--rule" />
              <span className="rr-skeleton" />
              <span className="rr-skeleton" />
            </div>
          </div>
        ) : (
          <div className="rr-skeleton-group rr-skeleton-grid" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="rr-skeleton-cell">
                <span className="rr-skeleton rr-skeleton--rule" />
                <span className="rr-skeleton rr-skeleton--chip" />
                <span className="rr-skeleton rr-skeleton--short" />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
