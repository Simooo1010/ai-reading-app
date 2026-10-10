import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemActions } from "@/components/ItemActions";
import { ScreenSkeleton } from "@/components/Skeleton";
import { TodayView } from "@/components/TodayView";
import { getItemsCached } from "@/lib/notion";
import { pickNext, pickUpcoming, toCardData, todayContext } from "@/lib/today";

export const metadata: Metadata = { title: "Today · AI Reading" };

export default function TodayPage() {
  return (
    <Suspense fallback={<ScreenSkeleton title="Today" variant="card" />}>
      <TodayContent />
    </Suspense>
  );
}

async function TodayContent() {
  const items = await getItemsCached();
  const next = pickNext(items);
  const card = next ? toCardData(next, items) : null;

  return (
    <TodayView
      context={todayContext(items)}
      card={card}
      actions={
        card && (
          <ItemActions
            key={`${card.id}:${card.status}`}
            id={card.id}
            status={card.status}
            allowReset={false}
          />
        )
      }
      upNext={pickUpcoming(items, 3).map((i) => ({
        id: i.id,
        order: i.order,
        title: i.title,
        author: i.author,
        readingTimeMin: i.readingTimeMin,
        layer: i.layer,
      }))}
    />
  );
}
