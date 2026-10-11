// The generated app icons (app/icon.tsx). The manifest (app/manifest.ts)
// lists the same ids, so its icon URLs always match real routes.
//
// URL of each icon: /icon/<id> (Next.js generateImageMetadata).

export const APP_ICONS = [
  { id: "192", size: 192, scale: 0.62, purpose: "any" },
  { id: "512", size: 512, scale: 0.62, purpose: "any" },
  // Maskable: Android may cut the outer 10% of each side; the book stays inside.
  { id: "maskable", size: 512, scale: 0.5, purpose: "maskable" },
] as const;

export const APPLE_ICON_SIZE = 180;
export const ICON_MARK_SCALE = 0.62;

export function appIconUrl(id: string): string {
  return `/icon/${id}`;
}
