import { Slider } from "@web/ui/components/slider";
import { LAYOUT } from "../layout.js";
import { radiusLabel } from "../model/format.js";

/**
 * The Near me distance, a shadcn Slider (Base UI) in its own chunk: it only exists while Near me is on. Arrow keys, Home,
 * End and dragging all work. `onChange` fires on every step; `onCommit` when the drag or key press ends.
 */
export default function DistanceSlider({ km, onChange, onCommit }: { km: number; onChange: (km: number) => void; onCommit: () => void }) {
  return (
    <>
      <Slider
        id="radius"
        className="radius-slider"
        min={LAYOUT.nearKm.min}
        max={LAYOUT.nearKm.max}
        step={LAYOUT.nearKm.step}
        value={km}
        onValueChange={(value) => onChange(Array.isArray(value) ? value[0]! : value)}
        onValueCommitted={onCommit}
        thumbAlignment="edge"
        thumbLabel="Distance from you in kilometres"
        getThumbValueText={(_formatted, value) => radiusLabel(value)}
      />
      <output htmlFor="radius">{radiusLabel(km)}</output>
    </>
  );
}
