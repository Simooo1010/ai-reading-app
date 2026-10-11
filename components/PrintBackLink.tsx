"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { backLink, printFrom } from "@/lib/print/screen";

// "Back to Today" / "Back to Path" on the print loading screen. loading.tsx
// gets no searchParams, so the `from` query is read here in the browser
// (same whitelist as the print page: lib/print/screen.ts). Until it is read,
// the link goes to Today. A client-side link: no full reload of the app.

function Back({ from }: { from: unknown }) {
  const back = backLink(printFrom(from));
  return (
    <Link className="rr-btn rr-btn--link" href={back.href} prefetch={false}>
      {back.label}
    </Link>
  );
}

function BackFromQuery() {
  return <Back from={useSearchParams().get("from")} />;
}

export function PrintBackLink() {
  return (
    <Suspense fallback={<Back from={null} />}>
      <BackFromQuery />
    </Suspense>
  );
}
