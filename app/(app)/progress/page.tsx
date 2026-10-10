import type { Metadata } from "next";
import { Suspense } from "react";
import { ProgressView } from "@/components/ProgressView";
import { ScreenSkeleton } from "@/components/Skeleton";
import { requireAuthOrRedirect } from "@/lib/auth";
import { getItemsCached } from "@/lib/notion";
import { progressData } from "@/lib/progress";
import { todayInRome } from "@/lib/today";

export const metadata: Metadata = { title: "Progress · AI Reading" };

export default function ProgressPage() {
  return (
    <Suspense fallback={<ScreenSkeleton title="Progress" variant="stats" />}>
      <ProgressContent />
    </Suspense>
  );
}

async function ProgressContent() {
  // "Today" (Europe/Rome) decides this week, the streak and the projection,
  // so this part is rendered per request, never prerendered with a stale day.
  // requireAuthOrRedirect waits for the request first (connection()), then
  // sends visitors without a valid sign-in cookie to /login.
  await requireAuthOrRedirect("/progress");
  const items = await getItemsCached();
  return <ProgressView data={progressData(items, todayInRome())} />;
}
