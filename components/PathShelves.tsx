"use client";

// Path screen: five shelves + the selected-item bar. Spines are narrower than
// 44px, so the real control is a SCRUB gesture: press on a shelf and drag, the
// spine under the finger lifts and the bar updates live. Arrow keys move one
// spine. The arrow button in the bar opens the detail sheet (PathSheetHost
// listens for [data-item-id]).

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowUpRightIcon } from "@/components/Icons";
import { Spine } from "@/components/Spine";
import { formatOrder, type PhaseView } from "@/lib/path";
import { moveSelection } from "@/lib/shelf";
import { formatMinutes } from "@/lib/today";

export function PathShelves({ phases }: { phases: PhaseView[] }) {
  const nowPhase = phases.find((p) => p.isNow)?.number ?? phases[0]?.number ?? 0;
  const [open, setOpen] = useState<number>(nowPhase);
  const allRows = useMemo(() => phases.flatMap((p) => p.rows), [phases]);
  const firstOpen = phases.find((p) => p.number === nowPhase)?.rows.find((r) => r.status !== "Done" && r.status !== "Skipped");
  const [selectedId, setSelectedId] = useState<string | null>(firstOpen?.id ?? allRows[0]?.id ?? null);
  const scrubbing = useRef(false);
  const selected = allRows.find((r) => r.id === selectedId) ?? null;
  const nextId = firstOpen?.id ?? null;

  const select = useCallback((id: string | null) => {
    if (!id) return;
    setSelectedId((prev) => {
      if (prev !== id && typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(4); // light haptics where supported
        } catch {
          /* not allowed: ignore */
        }
      }
      return id;
    });
  }, []);

  function spineAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-spine-id]");
    return el?.dataset.spineId ?? null;
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    scrubbing.current = true;
    const id = spineAt(e.clientX, e.clientY);
    if (id) select(id);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!scrubbing.current || e.pointerType === "mouse" && e.buttons === 0) return;
    const id = spineAt(e.clientX, e.clientY);
    if (id) select(id);
  }
  function endScrub() {
    scrubbing.current = false;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>, phase: PhaseView) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const ids = phase.rows.map((r) => r.id);
    const to = moveSelection(ids, ids.includes(selectedId ?? "") ? selectedId : null, delta);
    select(to);
    if (to) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-spine-id="${CSS.escape(to)}"]`)?.focus(),
      );
    }
  }

  return (
    <div className="rr-path">
      <div className="rr-legend" aria-label="Legend">
        <span className="rr-legend__item"><i className="rr-legend__swatch rr-spine--todo" />To read</span>
        <span className="rr-legend__item"><i className="rr-legend__swatch rr-spine--active" />Next</span>
        <span className="rr-legend__item"><i className="rr-legend__swatch rr-spine--done" />Done</span>
        <span className="rr-legend__item"><i className="rr-legend__swatch rr-spine--skipped" />Skipped</span>
        <span className="rr-legend__item"><i className="rr-legend__swatch rr-spine--todo rr-spine--hatch" />Counterweight</span>
      </div>

      <div className="rr-selected" aria-live="polite">
        {selected ? (
          <>
            <span className="rr-selected__num">{formatOrder(selected.order)}</span>
            <span className="rr-selected__body">
              <span className="rr-selected__title">{selected.title}</span>
              <span className="rr-selected__meta">
                {[selected.type, formatMinutes(selected.readingTimeMin), selected.difficulty, selected.status]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <button
              type="button"
              className="rr-selected__go"
              data-item-id={selected.id}
              aria-haspopup="dialog"
              aria-label={`Open details: ${selected.title}`}
            >
              <ArrowUpRightIcon />
            </button>
          </>
        ) : (
          <span className="rr-selected__meta">Nothing selected</span>
        )}
      </div>

      {phases.map((p) => {
        const isOpen = open === p.number;
        const spines = p.rows.map((r) => ({
          id: r.id,
          order: r.order,
          title: r.title,
          readingTimeMin: r.readingTimeMin,
          difficulty: r.difficulty,
          status: r.status,
          layer: r.layer,
        }));
        return (
          <section key={p.phase} className="rr-phase" aria-label={p.phase}>
            <button
              type="button"
              className="rr-phase__toggle"
              aria-expanded={isOpen}
              aria-controls={`phase-${p.number}`}
              onClick={() => setOpen(p.number)}
            >
              <span className="rr-phase__head">
                <span className="rr-phase-title">{p.phase}</span>
                {p.isNow && <span className="rr-phase__now">Now</span>}
              </span>
              <span className="rr-phase__line">
                <span className="rr-phase__count">{p.countText}</span>
                <span className="rr-phase__hours">
                  {p.hoursDone} <span className="rr-phase__of">of</span> {p.hoursTotal} h
                </span>
              </span>
            </button>
            <div
              id={`phase-${p.number}`}
              role="group"
              aria-label={`${p.phase} shelf`}
              className={`rr-shelf ${isOpen ? "rr-shelf--stretch rr-shelf--current" : "rr-shelf--scroll"}`}
              style={{ height: isOpen ? 114 : 68 }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endScrub}
              onPointerCancel={endScrub}
              onKeyDown={(e) => onKeyDown(e, p)}
            >
              {spines.map((s) => (
                <Spine
                  key={s.id}
                  spine={s}
                  mode={isOpen ? "stretch" : "scroll"}
                  isNext={s.id === nextId}
                  selected={s.id === selectedId}
                  interactive
                />
              ))}
            </div>
            <span className="rr-phase__fill" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.max(0, p.percent))}%` }} />
            </span>
          </section>
        );
      })}
    </div>
  );
}
