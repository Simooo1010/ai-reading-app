import type { Metadata } from "next";
import { Suspense } from "react";
import { NextItemCard } from "@/components/NextItemCard";
import { UndoProvider } from "@/components/UndoProvider";
import { UpNext } from "@/components/UpNext";
import { getItemsCached } from "@/lib/notion";
import { pairedTitles, pickNext, pickUpcoming } from "@/lib/today";

export const metadata: Metadata = { title: "Today · AI Reading" };

export default function TodayPage() {
  return (
    <UndoProvider>
      <h1 className="page-title">Today</h1>
      <Suspense fallback={<TodaySkeleton />}>
        <TodayContent />
      </Suspense>
    </UndoProvider>
  );
}

async function TodayContent() {
  const items = await getItemsCached();
  const next = pickNext(items);

  if (!next) {
    return (
      <div className="card state">
        <h2 className="next-title">All done. Nice work.</h2>
        <p className="muted">There is nothing left to read in your path.</p>
      </div>
    );
  }

  return (
    <>
      <NextItemCard
        item={next}
        answers={pairedTitles(next, items)}
      />
      <UpNext items={pickUpcoming(items, 3)} />
    </>
  );
}

function TodaySkeleton() {
  return (
    <div className="card skeleton" aria-busy="true" aria-label="Loading">
      <div className="sk sk-line sk-short" />
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      <div className="sk sk-line" />
      <div className="sk sk-button" />
    </div>
  );
}
