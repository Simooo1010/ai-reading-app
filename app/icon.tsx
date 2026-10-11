import { ImageResponse } from "next/og";
import { AppIconMark } from "@/components/AppIconMark";
import { APP_ICONS } from "@/lib/app-icons";

// App icons for the web app manifest (app/manifest.ts) and <link rel="icon">.
// One file, three PNGs: /icon/192, /icon/512 and /icon/maskable (512, with
// the book inside the maskable safe zone). Generated at build time.
// These URLs are public in proxy.ts (iOS and browsers fetch them without
// the sign-in cookie).

export function generateImageMetadata() {
  return APP_ICONS.map((icon) => ({
    id: icon.id,
    contentType: "image/png",
    size: { width: icon.size, height: icon.size },
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const want = await id;
  const icon = APP_ICONS.find((i) => i.id === want) ?? APP_ICONS[0];
  return new ImageResponse(<AppIconMark size={icon.size} scale={icon.scale} />, {
    width: icon.size,
    height: icon.size,
  });
}
