import { APP_GROUND } from "@/lib/app-colors";
import { BRAIN_ASPECT, brainMarkDataUri } from "@/lib/brain-mark";

// The app icon (home screen, manifest): the brain mark in ink on the cream
// ground (design-system/brand/README.md). Two colours, no third.
// Rendered only by next/og (app/icon.tsx, app/apple-icon.tsx), so it uses
// inline styles, not CSS classes.

const MARK = brainMarkDataUri();

/**
 * @param size  icon edge in px
 * @param scale width of the brain as a share of the edge (see lib/app-icons.ts)
 */
export function AppIconMark({ size, scale }: { size: number; scale: number }) {
  const width = Math.round(size * scale);
  const height = Math.round(width / BRAIN_ASPECT);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: APP_GROUND,
      }}
    >
      {/* next/og cannot use next/image; an <img> with a data URI is the supported way */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK} width={width} height={height} alt="" />
    </div>
  );
}
