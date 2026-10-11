import { ImageResponse } from "next/og";
import { AppIconMark } from "@/components/AppIconMark";
import { APPLE_ICON_SIZE, ICON_MARK_SCALE } from "@/lib/app-icons";

// Home screen icon for iPhone (<link rel="apple-touch-icon">), 180 x 180.
// iOS rounds the corners itself, so the ground fills the whole square.
// Public in proxy.ts: iOS fetches it without the sign-in cookie.

export const size = { width: APPLE_ICON_SIZE, height: APPLE_ICON_SIZE };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIconMark size={APPLE_ICON_SIZE} scale={ICON_MARK_SCALE} />, {
    ...size,
  });
}
