import Image from "next/image";

// The app mark (design-system/brand/README.md). The file already has the
// ground colour behind the brain, so it sits on the page without a box.
// Decorative: the screen title next to it names the app.
export function BrandMark() {
  return (
    <Image
      className="rr-mark"
      src="/icons/mark.svg"
      alt=""
      width={160}
      height={160}
      unoptimized
      priority
    />
  );
}
