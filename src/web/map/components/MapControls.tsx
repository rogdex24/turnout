import { Compass, LocateFixed, Minus, Plus } from "lucide-react";
import { Icon } from "./Icon.js";

/**
 * The control column (DESIGN.md, Chrome layout): zoom in, zoom out, locate (Near me) and, while the map is rotated, a compass.
 * Icon-only 36 px buttons named for assistive technology. It needs the map, so it stays hidden until the map is ready.
 */
export function MapControls({
  ready,
  geolocation,
  requesting,
  nearOn,
  rotated,
  onZoom,
  onNorth,
  onNear,
}: {
  ready: boolean;
  geolocation: boolean;
  requesting: boolean;
  nearOn: boolean;
  rotated: boolean;
  onZoom: (by: 1 | -1) => void;
  onNorth: () => void;
  onNear: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset brings a UA border, padding and min-inline-size that would change the layout; role=group is the same semantics
    <div className="map-controls" role="group" aria-label="Map controls" hidden={!ready}>
      <button type="button" className="pill round" aria-label="Zoom in" onClick={() => onZoom(1)}>
        <Icon as={Plus} />
      </button>
      <button type="button" className="pill round" aria-label="Zoom out" onClick={() => onZoom(-1)}>
        <Icon as={Minus} />
      </button>
      <button
        type="button"
        className={nearOn ? "pill round on" : "pill round"}
        id="near"
        hidden={!geolocation}
        aria-label={requesting ? "Locating…" : "Near me"}
        aria-pressed={nearOn}
        aria-busy={requesting}
        disabled={requesting}
        onClick={onNear}
      >
        <Icon as={LocateFixed} />
      </button>
      <button type="button" className="pill round" id="compass" hidden={!rotated} aria-label="Reset the map to north" onClick={onNorth}>
        <Icon as={Compass} />
      </button>
    </div>
  );
}
