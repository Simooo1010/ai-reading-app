// Print page guard: the loader can fail before it even runs (for example the
// jsdom module cannot be loaded on the server). Without this guard the error
// is thrown inside the Suspense child after the loading screen has streamed,
// and the user sees "Getting the page…" forever.
//
// The loader is imported lazily, so a module that fails to load becomes a
// rejected promise we can catch, not a crash of the whole page module.
// No static import of ./load here (only types): that file pulls in jsdom.

import { safeHttpUrl } from "../links";
import type { PrintItemInput, PrintLoad } from "./load";

export const LOADER_FAILED_MESSAGE = "We could not open this page. Try again, or open the source.";

export type PrintLoader = (item: PrintItemInput) => Promise<PrintLoad>;

export interface SafeLoadDeps {
  /** Default: lazy import of loadPrintable from ./load. */
  importLoader?: () => Promise<PrintLoader>;
  /** Server log (never gets secrets: only the error name and message). */
  log?: (message: string) => void;
}

const defaultImport = async (): Promise<PrintLoader> => (await import("./load")).loadPrintable;

/** loadPrintable() that never throws, even when the loader module cannot load. */
export async function loadPrintableSafe(item: PrintItemInput, deps: SafeLoadDeps = {}): Promise<PrintLoad> {
  const log = deps.log ?? ((m: string) => console.error(m));
  try {
    const load = await (deps.importLoader ?? defaultImport)();
    return await load(item);
  } catch (e) {
    const why = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : "unknown";
    log(`print: loader failed: ${why}`);
    return { kind: "error", message: LOADER_FAILED_MESSAGE, openUrl: safeHttpUrl(item.link) ?? "", code: "loader-failed" };
  }
}
