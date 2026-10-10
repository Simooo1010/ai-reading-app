"use client";

// The last print customization, kept in localStorage ("rr-print-settings-v1")
// so a rare use is still quick (SPEC.md §7.4). Every storage access is in
// try/catch and every stored value goes through parseSettings, so a blocked,
// full or broken storage never breaks the page: the settings then last for
// this visit only. The server render and the first client render use the
// defaults (the HTML always matches); the stored value is read right after
// hydration through useSyncExternalStore.

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_SETTINGS,
  parseSettings,
  type PrintSettings,
  serializeSettings,
  SETTINGS_STORAGE_KEY,
} from "@/lib/print/settings";

let memory: PrintSettings | null = null;
let cacheRaw: string | null | undefined;
let cacheValue: PrintSettings = { ...DEFAULT_SETTINGS };
const listeners = new Set<() => void>();
const SERVER_VALUE: PrintSettings = { ...DEFAULT_SETTINGS };

function read(): PrintSettings {
  if (memory) return memory;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    raw = null;
  }
  // Same raw string -> same object (useSyncExternalStore needs a stable snapshot).
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheValue = raw === null ? { ...DEFAULT_SETTINGS } : parseSettings(raw);
  }
  return cacheValue;
}

function write(next: PrintSettings): void {
  memory = parseSettings(next);
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(memory));
  } catch {
    // Storage blocked or full: the in-memory value is used for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SETTINGS_STORAGE_KEY || e.key === null) {
      memory = null; // another tab changed it: read storage again
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = () => SERVER_VALUE;

export function usePrintSettings(): {
  settings: PrintSettings;
  update: (patch: Partial<PrintSettings>) => void;
  reset: () => void;
} {
  const settings = useSyncExternalStore(subscribe, read, serverSnapshot);
  const update = useCallback((patch: Partial<PrintSettings>) => write({ ...read(), ...patch }), []);
  const reset = useCallback(() => write({ ...DEFAULT_SETTINGS }), []);
  return { settings, update, reset };
}
