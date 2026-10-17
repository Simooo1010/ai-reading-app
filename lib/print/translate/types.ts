// Shared contract for "Print in Italian" (SPEC.md §7.4, Italian).
// Pure types and messages: client-safe (no server imports here).

import type { PrintResult } from "../types";

export type TranslationEngine = "gemini" | "google";

export interface TranslationInfo {
  language: "it";
  /** "complete": every part translated. "partial": some parts stayed English. */
  status: "complete" | "partial";
  /** Parts translated / parts that should be translated. */
  translated: number;
  total: number;
  engines: TranslationEngine[];
}

export type TranslateActionResult =
  | { ok: true; result: PrintResult; info: TranslationInfo }
  | { ok: false; error: string };

/** Simple English (B1) for the UI. */
export const TRANSLATE_MESSAGES = {
  unavailable: "Italian is not available right now. Try again in a few minutes.",
  notSupported: "This source cannot be translated.",
  signIn: "Please sign in again.",
  loading: "Translating to Italian…",
  machineNote: "Translated to Italian by machine. It may contain errors.",
  partialNote: "Partial translation: some parts are still in English.",
} as const;
