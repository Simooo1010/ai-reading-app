import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemActions } from "@/components/ItemActions";
import { ScreenSkeleton } from "@/components/Skeleton";
import { TodayView } from "@/components/TodayView";
import { requireAuthOrRedirect } from "@/lib/auth";
import { getItemsCached } from "@/lib/notion";
import { formatHours, groupByPhase, phaseStats } from "@/lib/path";
import { streak } from "@/lib/stats";
import { pickNext, pickUpcoming, toCardData, todayContext, todayInRome } from "@/lib/today";
import type { SpineData } from "@/components/Spine";
import type { Item } from "@/lib/types";
import type { ShelfPreview } from "@/components/TodayView";

export const metadata: Metadata = { title: "Today · AI Reading" };

export default function TodayPage() {
  return (
    <Suspense fallback={<ScreenSkeleton title="Today" variant="card" />}>
      <TodayContent />
    </Suspense>
  );
}

function toSpine(i: Item): SpineData {
  return {
    id: i.id,
    order: i.order,
    title: i.title,
    readingTimeMin: i.readingTimeMin,
    difficulty: i.difficulty,
    status: i.status,
    layer: i.layer,
  };
}

async function TodayContent() {
  // Defense in depth: proxy.ts already checks the cookie.
  await requireAuthOrRedirect("/today");
  const items = await getItemsCached();
  const next = pickNext(items);
  const card = next ? toCardData(next, items) : null;

  const run = streak(items, todayInRome());
  const groups = groupByPhase(items);
  // All read: show the last shelf with every spine solid.
  const group = next ? groups.find((g) => g.phase === next.phase) : groups[groups.length - 1];
  let shelf: ShelfPreview | null = null;
  if (group) {
    const stats = phaseStats(group.items);
    const noun = stats.itemsTotal === 1 ? "ITEM" : "ITEMS";
    shelf = {
      label: `${group.phase.toUpperCase()} SHELF · ${stats.itemsTotal} ${noun} · ${formatHours(stats.minutesTotal)} H`,
      spines: group.items.map(toSpine),
      nextId: next?.id ?? null,
      following: pickUpcoming(items, 1)[0]?.title ?? null,
      wall: groups.map((g) => {
        const st = phaseStats(g.items);
        return {
          label: `${g.phase.toUpperCase()} · ${st.itemsTotal} ${st.itemsTotal === 1 ? "ITEM" : "ITEMS"} · ${formatHours(st.minutesTotal)} H`,
          current: g === group,
          spines: g.items.map(toSpine),
        };
      }),
    };
  }

  return (
    <TodayView
      context={todayContext(items).toUpperCase()}
      streak={run.days > 0 ? `${run.days} day${run.days === 1 ? "" : "s"} streak`.toUpperCase() : null}
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
      shelf={shelf}
    />
  );
}
