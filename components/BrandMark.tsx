import Image from "next/image";
import { BRAIN_ASPECT, brainMarkDataUri } from "@/lib/brain-mark";

// The app mark on the sign-in screen (design-system/brand/README.md). The
// drawing has no background, so it sits on the cream page without a box.
// Decorative: the screen title next to it names the app.
const WIDTH = 96;

export function BrandMark() {
  return (
    <Image
      className="rr-mark"
      src={brainMarkDataUri()}
      alt=""
      width={WIDTH}
      height={Math.round(WIDTH / BRAIN_ASPECT)}
      unoptimized
      priority
    />
  );
}
