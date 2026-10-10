import type { Metadata } from "next";
import { Suspense } from "react";
import PrintClient from "@/components/print/PrintClient";
import { PrintMessage, PrintSkeleton } from "@/components/PrintStates";
import { requireAuthOrRedirect } from "@/lib/auth";
import { getItemsCached, isPageId } from "@/lib/notion";
import { loadPrintable } from "@/lib/print/load";
import { backLink, findItem, printFrom } from "@/lib/print/screen";

// Print page (SPEC §7.4). Outside the (app) group: no tab bar.
// Always rendered at request time (auth cookie first, then data); nothing
// here is prerendered with user data. The page download has a 15 s timeout
// (lib/print/fetch.ts); maxDuration caps the whole render on Vercel.

export const metadata: Metadata = { title: "Print · AI Reading" };
export const maxDuration = 60;
// Never prefetch this segment: Print costs nothing until it is opened.
export const prefetch = "force-disabled";

export default function PrintPage({ params, searchParams }: PageProps<"/print/[id]">) {
  return (
    <Suspense fallback={<PrintSkeleton />}>
      <PrintContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PrintContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const from = printFrom((await searchParams).from);
  // Auth before any data read. proxy.ts checks the cookie too.
  await requireAuthOrRedirect(`/print/${encodeURIComponent(id)}?from=${from}`);

  const back = backLink(from);
  const notFound = (
    <PrintMessage
      message="We could not find this item."
      back={{ href: "/today", label: "Back to Today" }}
      alert
    />
  );
  if (!isPageId(id)) return notFound;

  const item = findItem(await getItemsCached(), id);
  if (!item) return notFound;

  const context = `${item.phase} · item ${item.order}`;
  const load = await loadPrintable({
    id: item.id,
    title: item.title,
    author: item.author,
    link: item.link,
    readingTimeMin: item.readingTimeMin,
  });

  if (load.kind === "document") {
    return (
      <PrintClient
        item={{
          id: item.id,
          title: item.title,
          author: item.author,
          link: item.link,
          readingTimeMin: item.readingTimeMin,
        }}
        result={load.result}
        backHref={back.href}
      />
    );
  }
  if (load.kind === "open-pdf") {
    return (
      <PrintMessage
        context={context}
        title={item.title}
        message={load.message}
        primary={{ href: load.url, label: "Open PDF" }}
        back={back}
      />
    );
  }
  return (
    <PrintMessage
      context={context}
      title={item.title}
      message={load.message}
      primary={load.openUrl ? { href: load.openUrl, label: "Open source" } : null}
      back={back}
      alert
    />
  );
}
