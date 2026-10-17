// "Print in Italian" on the print screen (SPEC.md §7.4). Client-safe pure
// code: the texts and rules the print screen uses around the server action
// translateToItalian (app/print/[id]/actions.ts). No server imports here.

import { pdfTitle } from "./format";
import { TRANSLATE_MESSAGES, type TranslateActionResult, type TranslationInfo } from "./translate/types";
import type { PrintDocument, PrintResult } from "./types";

export const PRINT_LANGUAGES = ["en", "it"] as const;
export type PrintLanguage = (typeof PRINT_LANGUAGES)[number];

/** Each language in its own name (the control is a language picker). */
export const LANGUAGE_LABELS: Record<PrintLanguage, string> = {
  en: "English",
  it: "Italiano",
};

export function isPrintLanguage(v: unknown): v is PrintLanguage {
  return typeof v === "string" && (PRINT_LANGUAGES as readonly string[]).includes(v);
}

/** Results the print screen shows as pages (the others show a notice). */
export function canPrint(result: Pick<PrintResult, "status" | "document">): boolean {
  const doc = result.document;
  return (
    !!doc &&
    Array.isArray(doc.elements) &&
    doc.elements.length > 0 &&
    (result.status === "ok" || result.status === "warning" || result.status === "paywalled" || result.status === "too-short")
  );
}

/** A translated result the print screen can really show and print. */
export type ItalianPrint = { result: PrintResult; info: TranslationInfo };

function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/**
 * The action's answer as a printable Italian result, or null when it cannot be
 * used (an error, or a broken / empty answer): the screen then stays English.
 */
export function usableTranslation(res: TranslateActionResult | null | undefined): ItalianPrint | null {
  if (!res || res.ok !== true) return null;
  const { result, info } = res;
  if (!result || !info || info.language !== "it") return null;
  if (info.status !== "complete" && info.status !== "partial") return null;
  if (!isCount(info.translated) || !isCount(info.total)) return null;
  // Never switch to something that cannot be printed (there would be no way back).
  if (!canPrint(result) || !result.check) return null;
  return { result, info };
}

/** The error line when Italian could not be made (the server's B1 text, else the default). */
export function translateErrorMessage(res: TranslateActionResult | null | undefined): string {
  if (res && res.ok === false && typeof res.error === "string" && res.error.trim()) return res.error.trim();
  return TRANSLATE_MESSAGES.unavailable;
}

/** The notes printed in the header and the footer of an Italian printout (never empty). */
export function paperTranslationNotes(info: Pick<TranslationInfo, "status" | "translated" | "total">): string[] {
  const notes: string[] = [TRANSLATE_MESSAGES.machineNote];
  if (isPartialTranslation(info)) notes.push(TRANSLATE_MESSAGES.partialNote);
  return notes;
}

/** Check line: "Translated 41 of 42 parts." */
export function translationCheckLine(info: Pick<TranslationInfo, "translated" | "total">): string {
  const total = Math.max(0, Math.floor(info.total));
  const done = Math.min(total, Math.max(0, Math.floor(info.translated)));
  return `Translated ${done} of ${total} ${total === 1 ? "part" : "parts"}.`;
}

/**
 * True when some parts stayed English. A "complete" status with fewer parts
 * than the total also counts: a half-translated page never passes silently.
 */
export function isPartialTranslation(info: Pick<TranslationInfo, "status" | "translated" | "total">): boolean {
  return info.status === "partial" || info.translated < info.total;
}

/** The warning under the check line for a partial translation (and how to try again), else null. */
export function translationWarning(info: Pick<TranslationInfo, "status" | "translated" | "total">): string | null {
  return isPartialTranslation(info)
    ? `${TRANSLATE_MESSAGES.partialNote} Look at the preview before you print. To try the rest again, tap English, then Italiano.`
    : null;
}

/**
 * Block ids carry the language, so a language switch builds and measures the
 * pages again (Print stays off until the new pages are counted).
 */
export function blockIdPrefix(lang: PrintLanguage): string {
  return lang === "en" ? "" : `${lang}-`;
}

/** The PDF file name: the Italian title in Italian, else the reading list title. */
export function printFileTitle(lang: PrintLanguage, itemTitle: string, doc: Pick<PrintDocument, "title"> | null | undefined): string {
  const italian = lang === "it" ? doc?.title?.trim() : "";
  return pdfTitle(italian || itemTitle, doc);
}
