import { BRAIN_ASPECT, BRAIN_FOLDS, BRAIN_MIRROR, BRAIN_OUTLINE, BRAIN_VIEW_BOX } from "@/lib/brain-mark";

// The app mark on the sign-in screen (design-system/brand/README.md). The
// drawing has no background, so it sits on the page without a box. It is
// inline SVG (not an <img>) so its colours come from the tokens and follow
// the theme: ink body, ground fold lines (.rr-mark__body, .rr-mark__folds).
// The app icons cannot do this; they stay light (lib/app-colors.ts).
// Decorative: the screen title next to it names the app.
const WIDTH = 96;

export function BrandMark() {
  return (
    <svg
      className="rr-mark"
      viewBox={BRAIN_VIEW_BOX}
      width={WIDTH}
      height={Math.round(WIDTH / BRAIN_ASPECT)}
      aria-hidden="true"
      focusable="false"
    >
      <g transform={BRAIN_MIRROR}>
        <path className="rr-mark__body" d={BRAIN_OUTLINE} />
        <g className="rr-mark__folds">
          {BRAIN_FOLDS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </g>
    </svg>
  );
}
