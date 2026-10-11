import { PrinterIcon } from "@/components/Icons";
import { safeHttpUrl } from "@/lib/links";
import { printHref, type PrintFrom } from "@/lib/print/screen";

type Props = {
  id: string;
  title: string;
  /** The source link when it is already a PDF (opensAsPdf, computed on the server), else null. */
  pdfLink?: string | null;
  from: PrintFrom;
  /** "text": printer icon + word (Today card, detail sheet). "icon": icon only (Path rows). */
  variant: "text" | "icon";
};

/**
 * Quiet entry point to Print (SPEC §7.4 "Used sometimes, not always").
 * A plain <a>: nothing is fetched, prefetched or rendered until the tap.
 * A PDF source opens straight away ("Open PDF"), in a new tab.
 */
export function PrintLink({ id, title, pdfLink, from, variant }: Props) {
  // An outside PDF link is http(s) only; anything else falls back to the print page.
  const pdfHref = safeHttpUrl(pdfLink);
  const pdf = pdfHref !== null;
  const word = pdf ? "Open PDF" : "Print";
  const newTab = pdf ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const href = pdfHref ?? printHref(id, from);

  if (variant === "icon") {
    return (
      <a
        className="rr-print-icon"
        href={href}
        aria-label={pdf ? `Open PDF: ${title} (opens in a new tab)` : `Print ${title}`}
        {...newTab}
      />
    );
  }
  return (
    <a className="rr-print-link" href={href} {...newTab}>
      <PrinterIcon />
      {word}
      {pdf && <span className="rr-sr-only"> (opens in a new tab)</span>}
    </a>
  );
}
