"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { PencilIcon } from "@/components/Icons";
import { WeekBars } from "@/components/ProgressCharts";
import { DEFAULT_TARGET_HOURS } from "@/lib/charts";
import {
  TARGET_STORAGE_KEY,
  formatTarget,
  parseStoredTarget,
  parseTargetInput,
} from "@/lib/progress";
import type { WeekHours } from "@/lib/stats";

// ---------- Target store (localStorage, every access in try/catch) ----------
// The server and the first client render use the default (5 h), so the HTML
// always matches; the stored value is read right after hydration through
// useSyncExternalStore. If storage is blocked, a saved target still works
// for this visit (kept in memory).

let memoryTarget: number | null = null;
const listeners = new Set<() => void>();

function readTarget(): number {
  if (memoryTarget !== null) return memoryTarget;
  try {
    return parseStoredTarget(window.localStorage.getItem(TARGET_STORAGE_KEY));
  } catch {
    return DEFAULT_TARGET_HOURS;
  }
}

function saveTarget(hours: number): void {
  memoryTarget = hours;
  try {
    window.localStorage.setItem(TARGET_STORAGE_KEY, String(hours));
  } catch {
    // Storage blocked or full: the in-memory value is used.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TARGET_STORAGE_KEY || e.key === null) {
      memoryTarget = null; // another tab changed it: read storage again
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const serverTarget = () => DEFAULT_TARGET_HOURS;

// true only after hydration: the stored target has been read (QA LOW-2).
const noSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

// ---------- Target form (presentational, controlled) ----------

export function TargetForm({
  inputId,
  errorId,
  value,
  error,
  inputRef,
  onChange,
  onSubmit,
  onCancel,
}: {
  inputId: string;
  errorId: string;
  value: string;
  error: string | null;
  inputRef?: Ref<HTMLInputElement>;
  onChange?: (value: string) => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    }
  };
  return (
    <form
      className="rr-target-form"
      noValidate
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
    >
      <div className="rr-field">
        <label className="rr-field__label" htmlFor={inputId}>
          Weekly target (hours)
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="rr-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      <button type="submit" className="rr-btn rr-btn--primary">
        Save
      </button>
      <button type="button" className="rr-btn rr-btn--link" onClick={onCancel}>
        Cancel
      </button>
      {error && (
        <p id={errorId} className="rr-field__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

// ---------- Section ----------

/** "Hours per week" section: Edit target + WeekBars. */
export function WeeklyHours({
  weeks,
  className,
}: {
  weeks: WeekHours[];
  /** Extra class for the section (grid area on wide screens). */
  className?: string;
}) {
  const target = useSyncExternalStore(subscribe, readTarget, serverTarget);
  const targetRead = useSyncExternalStore(noSubscribe, onClient, onServer);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  // Return focus to "Edit target" only after the form was open.
  const wasEditing = useRef(false);
  const ids = useId();

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
      wasEditing.current = true;
    } else if (wasEditing.current) {
      editRef.current?.focus();
      wasEditing.current = false;
    }
  }, [editing]);

  const open = () => {
    setDraft(formatTarget(target));
    setError(null);
    setEditing(true);
  };
  const close = () => {
    setError(null);
    setEditing(false);
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseTargetInput(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      inputRef.current?.focus();
      return;
    }
    saveTarget(parsed.hours);
    close();
  };

  return (
    <section
      className={className ? `rr-section ${className}` : "rr-section"}
      aria-labelledby="week-title"
    >
      <div className="rr-section__head">
        <h2 id="week-title" className="rr-label">
          Hours per week
        </h2>
        {!editing && (
          <button
            ref={editRef}
            type="button"
            className="rr-btn rr-btn--link rr-section__action"
            onClick={open}
          >
            <PencilIcon />
            Edit target
          </button>
        )}
      </div>
      {editing && (
        <TargetForm
          inputId={`${ids}-target`}
          errorId={`${ids}-target-error`}
          value={draft}
          error={error}
          inputRef={inputRef}
          onChange={(v) => {
            setDraft(v);
            if (error) setError(null);
          }}
          onSubmit={submit}
          onCancel={close}
        />
      )}
      {/* Until the saved target is read, the chart keeps its space but is not
          shown: it never flashes the default 5 h. Without JavaScript the
          <noscript> style shows it with the default. */}
      <div className="rr-week-chart" data-target-pending={targetRead ? undefined : ""}>
        <WeekBars weeks={weeks} targetHours={target} />
      </div>
      {!targetRead && (
        <noscript>
          <style>{".rr-week-chart[data-target-pending]{visibility:visible}"}</style>
        </noscript>
      )}
      <p className="rr-chart__caption">
        Weeks start on Monday. Solid bar: this week.
      </p>
    </section>
  );
}
