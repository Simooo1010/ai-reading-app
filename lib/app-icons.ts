// The generated app icons (app/icon.tsx). The manifest (app/manifest.ts)
// lists the same ids, so its icon URLs always match real routes.
//
// URL of each icon: /icon/<id> (Next.js generateImageMetadata).

// `scale` = width of the brain as a share of the icon edge. The brain is wider
// than tall, so 0.55 leaves generous space around it (it was chosen on the
// design review). It is also inside the maskable safe zone (a circle of 80%
// of the edge): the corners of the brain sit at about 32% from the centre.

export const APP_ICONS = [
  { id: "192", size: 192, scale: 0.546, purpose: "any" },
  { id: "512", size: 512, scale: 0.546, purpose: "any" },
  { id: "maskable", size: 512, scale: 0.546, purpose: "maskable" },
] as const;

export const APPLE_ICON_SIZE = 180;
export const ICON_MARK_SCALE = 0.546;

export function appIconUrl(id: string): string {
  return `/icon/${id}`;
}
