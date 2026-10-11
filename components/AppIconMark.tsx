import { APP_GROUND, APP_INK } from "@/lib/app-colors";

// The app icon (home screen, manifest): an open book drawn in ink on the
// cream ground. Thin strokes, no fill, no third colour (Reading Room).
// Rendered only by next/og (app/icon.tsx, app/apple-icon.tsx), so it uses
// inline styles and SVG attributes, not CSS classes.

/**
 * @param size  icon edge in px
 * @param scale share of the edge the book takes (0.62 for normal icons;
 *              smaller for maskable icons, whose outer 10% may be cut off)
 */
export function AppIconMark({ size, scale }: { size: number; scale: number }) {
  const mark = Math.round(size * scale);
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
      <svg width={mark} height={mark} viewBox="0 0 100 100" fill="none">
        {/* Left and right page: curved top and bottom edges meet at the spine */}
        <path
          d="M50 26 C41 20 28 19 13 22 L13 76 C28 73 41 74 50 81 Z"
          stroke={APP_INK}
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        <path
          d="M50 26 C59 20 72 19 87 22 L87 76 C72 73 59 74 50 81 Z"
          stroke={APP_INK}
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        {/* Lines of text on the right page (hairlines, like the app's rules) */}
        <path
          d="M58 37 C65 33 72 32 79 33 M58 48 C65 44 72 43 79 44 M58 59 C65 55 72 54 79 55"
          stroke={APP_INK}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
