import { ScreenHeader } from "@/components/ScreenHeader";

/** Loading state: header + neutral wash blocks (no text, no fake data). */
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
          <div className="rr-skeleton-group" aria-hidden="true">
            <span className="rr-skeleton rr-skeleton--chip" />
            <span className="rr-skeleton rr-skeleton--title" />
            <span className="rr-skeleton rr-skeleton--short" />
            <span className="rr-skeleton" />
            <span className="rr-skeleton rr-skeleton--rule" />
            <span className="rr-skeleton" />
            <span className="rr-skeleton rr-skeleton--short" />
            <span className="rr-skeleton rr-skeleton--button" />
          </div>
        ) : variant === "stats" ? (
          <div className="rr-skeleton-group" aria-hidden="true">
            <span className="rr-skeleton rr-skeleton--short" />
            <span className="rr-skeleton rr-skeleton--title" />
            <span className="rr-skeleton rr-skeleton--rule" />
            <span className="rr-skeleton rr-skeleton--short" />
            <span className="rr-skeleton rr-skeleton--rule" />
            <span className="rr-skeleton rr-skeleton--chart" />
            <span className="rr-skeleton rr-skeleton--rule" />
            <span className="rr-skeleton" />
            <span className="rr-skeleton" />
          </div>
        ) : (
          <div className="rr-skeleton-group" aria-hidden="true">
            {[0, 1, 2, 3, 4].flatMap((i) => [
              <span key={`r${i}`} className="rr-skeleton rr-skeleton--rule" />,
              <span key={`c${i}`} className="rr-skeleton rr-skeleton--chip" />,
              <span key={`s${i}`} className="rr-skeleton rr-skeleton--short" />,
            ])}
          </div>
        )}
      </div>
    </>
  );
}
