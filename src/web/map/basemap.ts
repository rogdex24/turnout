import type { StyleSpecification } from "maplibre-gl";
import { LAYOUT } from "./layout.js";

/**
 * The one place the basemap provider is named. OpenFreeMap needs no key. To
 * swap providers, point these at another vector style that uses the OpenMapTiles
 * layer names. DESIGN.md takes its `map` colors from these two styles; only the
 * layers in REPAINT change.
 */
export const BASE_STYLE_URL = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

export type Theme = keyof typeof BASE_STYLE_URL;

/** Road shields and path names never help someone choosing an event. */
const HIDDEN = /^(highway-shield|road_shield|highway-name-path)/;
/** POI, transit and airport labels appear only once the reader is zoomed in (DESIGN.md, Layout). */
const LATE = /^(airport|poi|transit)/;

/** DESIGN.md, Layout (basemap table): layer id to [paint property, basemap token]. */
const REPAINT: Record<string, [string, string]> = {
  water: ["fill-color", "water"],
  waterway: ["line-color", "waterway"],
  park: ["fill-color", "park"],
  landuse_park: ["fill-color", "park"],
  landcover_wood: ["fill-color", "wood"],
  highway_motorway_inner: ["line-color", "motorway"],
  highway_motorway_bridge_inner: ["line-color", "motorway"],
  highway_motorway_casing: ["line-color", "motorway-casing"],
  highway_motorway_bridge_casing: ["line-color", "motorway-casing"],
  highway_major_casing: ["line-color", "major-casing"],
};

/** The token's value for this theme from the generated CSS variables, or null when it has no twin for it. */
function basemapColor(token: string, theme: Theme): string | null {
  const css = getComputedStyle(document.documentElement);
  return css.getPropertyValue(`--color-basemap-${token}${theme === "dark" ? "-dark" : ""}`).trim() || null;
}

/** Returns a new style with sprite-dependent noise removed and POI-like layers held back until zoom 16. */
export function mapStyle(base: StyleSpecification, theme: Theme): StyleSpecification {
  const layers = base.layers.map((original) => {
    const layer = structuredClone(original) as typeof original & {
      layout?: Record<string, unknown>;
      paint?: Record<string, unknown>;
      minzoom?: number;
    };
    if (HIDDEN.test(layer.id)) {
      layer.layout ??= {};
      layer.layout.visibility = "none";
    }
    if (LATE.test(layer.id)) layer.minzoom = Math.max(layer.minzoom ?? 0, LAYOUT.zoom.poiHideBelow);
    // Sprite images (wood pattern, label dots) are not in OpenFreeMap's sprite sheet for every layer.
    if (layer.paint) delete layer.paint["fill-pattern"];
    const repaint = REPAINT[layer.id];
    const color = repaint && basemapColor(repaint[1], theme);
    if (repaint && color) layer.paint = { ...layer.paint, [repaint[0]]: color };
    if (layer.type === "symbol") delete layer.layout?.["icon-image"];
    return layer;
  });
  return { ...base, layers };
}
