import type { Metadata } from "next";
import { Suspense } from "react";
import { PathSheetHost } from "@/components/PathSheetHost";
import { PathView } from "@/components/PathView";
import { ScreenSkeleton } from "@/components/Skeleton";
import { getItemsCached } from "@/lib/notion";
import { formatPathSummary, pathPhases } from "@/lib/path";
import { toCardData } from "@/lib/today";

export const metadata: Metadata = { title: "Path · AI Reading" };

export default function PathPage() {
  return (
    <Suspense fallback={<ScreenSkeleton title="Path" variant="list" />}>
      <PathContent />
    </Suspense>
  );
}

async function PathContent() {
  const items = await getItemsCached();
  return (
    <PathSheetHost cards={items.map((item) => toCardData(item, items))}>
      <PathView summary={formatPathSummary(items)} phases={pathPhases(items)} />
    </PathSheetHost>
  );
}
