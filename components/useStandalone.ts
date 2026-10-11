"use client";

import { useSyncExternalStore } from "react";

// True when the app runs from the iPhone home screen (or as an installed web
// app): display-mode standalone, or Safari's own navigator.standalone.
// False on the server and in the first render (no hydration mismatch).

const QUERY = "(display-mode: standalone)";

function read(): boolean {
  try {
    if (window.matchMedia?.(QUERY).matches) return true;
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  try {
    const mq = window.matchMedia?.(QUERY);
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  } catch {
    return () => {};
  }
}

export function useStandalone(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
