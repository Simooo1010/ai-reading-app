import { Spine, type SpineData } from "@/components/Spine";

type Props = {
  spines: SpineData[];
  mode: "stretch" | "scroll";
  /** Height of the shelf in px (Today preview 96, Path current 114, others 68). */
  height: number;
  nextId?: string | null;
  marker?: boolean;
};

/** Static shelf (no interaction): spines standing on a 3px ink board. Used on Today. */
export function Shelf({ spines, mode, height, nextId = null, marker = false }: Props) {
  return (
    <div className={`rr-shelf rr-shelf--${mode}`} style={{ height }} aria-hidden="true">
      {spines.map((spine) => (
        <Spine
          key={spine.id}
          spine={spine}
          mode={mode}
          isNext={spine.id === nextId}
          marker={marker && spine.id === nextId}
        />
      ))}
    </div>
  );
}
