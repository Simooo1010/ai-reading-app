// Public API of the Print extraction layer (server side only).
// The network layer (fetch, route, cache) lives in other files and calls
// extractPrintable() with already-downloaded HTML.

export { extractPrintable, MESSAGES, type ExtractOptions } from "./extract";
export { sanitizeBlock, sanitizeInline, parseSrcset, bestFromSrcset, pickImageSrc, resolveUrl } from "./sanitize";
export { convertContent, detectEmbedProvider, type ConvertOptions, type ConvertResult } from "./convert";
export {
  countWords,
  visibleText,
  computeCheck,
  formatCheckLine,
  formatNumber,
  detectBotChallenge,
  TOLERANCE,
  LOW_COVERAGE,
  MIN_PRINTED_WORDS,
  type ConvertReport,
} from "./fidelity";
export { chooseContent, stripBoilerplate, pageWords, isArxivAbsUrl, isArxivHtmlUrl } from "./generic";
export { isSubstack, isSubstackNoteUrl, detectSubstackPaywall } from "./substack";
export { placeholderText } from "./types";
export type {
  EmbedProvider,
  FidelityCheck,
  HeadingLevel,
  ParagraphOrigin,
  PlaceholderKind,
  PrintDocument,
  PrintElement,
  PrintElementType,
  PrintResult,
  PrintSource,
  PrintStatus,
  PrintWarning,
  PrintWarningCode,
} from "./types";
