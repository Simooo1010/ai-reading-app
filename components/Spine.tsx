import type { CSSProperties } from "react";
import {
  isCounterweight,
  spineFill,
  spineHeight,
  spineLabel,
  spineWidth,
} from "@/lib/shelf";
import type { Difficulty, Layer, Status } from "@/lib/types";

export type SpineData = {
  id: string;
  order: number;
  title: string;
  readingTimeMin: number | null;
  difficulty: Difficulty;
  status: Status;
  layer: Layer;
};

type Props = {
  spine: SpineData;
  /** Stretch shelves share the width by minutes; scroll shelves use px widths. */
  mode: "stretch" | "scroll";
  /** The item shown on Today (yellow, with the marker). */
  isNext?: boolean;
  selected?: boolean;
  /** Spines in Path are buttons (aria-label); on Today they are decoration. */
  interactive?: boolean;
  /** Show the little triangle over the spine (Today preview). */
  marker?: boolean;
};

/**
 * One item as a book spine: WIDTH = reading time, HEIGHT = difficulty,
 * FILL = status (outline / yellow / solid / dashed), hatch = Counterweight.
 */
export function Spine({ spine, mode, isNext = false, selected = false, interactive = false, marker = false }: Props) {
  const fill = spineFill(spine.status, isNext);
  const minutes = spine.readingTimeMin ?? 0;
  const style = {
    "--rr-spine-h": `${Math.round(spineHeight(spine.difficulty, spine.status) * 1000) / 10}%`,
    ...(mode === "stretch"
      ? { flex: `${Math.max(minutes, 1)} 1 0` }
      : { width: `${spineWidth(spine.readingTimeMin)}px` }),
  } as unknown as CSSProperties;
  const className = [
    "rr-spine",
    `rr-spine--${fill}`,
    mode === "stretch" ? "rr-spine--stretch" : "",
    isCounterweight(spine.layer) ? "rr-spine--hatch" : "",
    selected ? "rr-spine--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const markerEl = marker ? <span className="rr-spine__marker" aria-hidden="true" /> : null;

  if (!interactive) {
    return (
      <span className={className} style={style} aria-hidden="true">
        {markerEl}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      data-spine-id={spine.id}
      aria-pressed={selected}
      aria-label={spineLabel(spine.order, spine.title, spine.readingTimeMin, spine.difficulty, spine.status)}
      tabIndex={selected ? 0 : -1}
    >
      {markerEl}
    </button>
  );
}
