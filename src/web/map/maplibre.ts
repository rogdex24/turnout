/**
 * The only MapLibre values the map uses, re-exported by name. MapCanvas loads this module on demand, so the server render
 * never touches MapLibre, and because the names are listed the bundler drops the rest (a bare `import("maplibre-gl")`
 * keeps every export, about 25 KB gzipped more).
 */
export { LngLatBounds, Map, Marker, setWorkerUrl } from "maplibre-gl";
