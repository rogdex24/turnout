import { MapMarker, type MapTheme, MapView, MarkerContent, useMap } from "@web/ui/map";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import { LngLatBounds } from "maplibre-gl";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { BASE_STYLE_URL, mapStyle } from "../basemap.js";
import { LAYOUT } from "../layout.js";
import type { Bounds } from "../model/filters.js";
import type { Location } from "../model/state.js";
import type { MapFeature } from "../types.js";
import { ClusterMarker, LocationDot, VenueMarker } from "./Markers.js";

declare const WORKER_URL: string;

const HYDERABAD_CENTRE: [number, number] = [78.4482, 17.4126];
const SOURCE = "venues";
const RADIUS = "near-radius";

export type CameraRequest =
  | { kind: "fit" }
  | { kind: "refresh" }
  | { kind: "focus"; venueId: string }
  | { kind: "ring" }
  | { kind: "zoom"; by: 1 | -1 }
  | { kind: "north" };
/** A request with a sequence number, so asking for the same move twice runs it twice. */
export interface CameraCommand {
  seq: number;
  request: CameraRequest;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

type Mark =
  | { key: string; kind: "venue"; venueId: string; lngLat: [number, number] }
  | { key: string; kind: "cluster"; clusterId: number; venues: number; events: number; lngLat: [number, number] };

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const isPhone = () => matchMedia(`(max-width: ${LAYOUT.phoneBelow - 1}px)`).matches;

/** The Near me circle as a 64-point polygon, or nothing while Near me is off. */
function radiusData(location: Location) {
  if (location.kind !== "on") return { type: "FeatureCollection" as const, features: [] };
  const { lat, lng } = location.origin;
  const dLat = location.km / 111.32;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const ring = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)];
  });
  return {
    type: "FeatureCollection" as const,
    features: [{ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } }],
  };
}

function sourceData(features: MapFeature[]) {
  return {
    type: "FeatureCollection" as const,
    // Approximate venues have no marker and never cluster, so they stay out of the source.
    features: features
      .filter((f) => f.properties.precision === "exact")
      .map((f) => ({
        type: "Feature" as const,
        geometry: f.geometry,
        properties: { venueId: f.properties.venueId, n: f.properties.events.length },
      })),
  };
}

export interface MapCanvasProps {
  /** Venues that match every filter, including the Near me radius. */
  features: MapFeature[];
  selectedVenue: string | null;
  location: Location;
  /** The part of the map the card or sheet covers, as camera padding, read when a move is made. */
  padding: () => Padding;
  command: CameraCommand | null;
  onSelect: (venueId: string | null) => void;
  /** The unobscured part of the map (the map minus the card or sheet), after every move. */
  onViewport: (bounds: Bounds) => void;
  onStatus: (status: "ready" | "failed") => void;
  /** The map's bearing in degrees after every move; 0 is north (the compass shows only when it is not). */
  onBearing: (degrees: number) => void;
  /** What is left of the startup deadline once this chunk has arrived. */
  startupMs?: number;
}

/**
 * The map: mapcn's `MapView` (src/web/ui/map.tsx) with our basemap, sources and markers. This chunk is loaded on demand by
 * MapApp, so the server render never touches MapLibre.
 */
export default function MapCanvas(props: MapCanvasProps) {
  const latest = useRef(props);
  latest.current = props;
  const styles = useRef(new globalThis.Map<MapTheme, StyleSpecification>());
  const [labels, setLabels] = useState(false);

  /** OpenFreeMap with our repaint, plus the venue source (clustered, in the style so it survives a theme swap) and the radius circle. */
  const loadStyle = useCallback(async (theme: MapTheme): Promise<StyleSpecification> => {
    if (!styles.current.has(theme)) styles.current.set(theme, mapStyle(await (await fetch(BASE_STYLE_URL[theme])).json(), theme));
    const style = structuredClone(styles.current.get(theme)!);
    const { features, location } = latest.current;
    style.sources[SOURCE] = {
      type: "geojson",
      data: sourceData(features),
      cluster: true,
      clusterRadius: LAYOUT.clusterRadius,
      clusterMaxZoom: LAYOUT.clusterMaxZoom,
      clusterProperties: { events: ["+", ["get", "n"]] },
    };
    style.layers.push({ id: "venues-hit", type: "circle", source: SOURCE, paint: { "circle-radius": 0 } });
    // Near me radius (DESIGN.md, Distance slider): a faint fill and dashed edge under the place labels.
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue(theme === "dark" ? "--color-primary-dark" : "--color-primary")
      .trim();
    style.sources[RADIUS] = { type: "geojson", data: radiusData(location) };
    const firstLabel = style.layers.findIndex((layer) => layer.type === "symbol");
    style.layers.splice(
      firstLabel < 0 ? style.layers.length : firstLabel,
      0,
      { id: "radius-fill", type: "fill", source: RADIUS, paint: { "fill-color": accent, "fill-opacity": LAYOUT.nearRing.fillOpacity } },
      {
        id: "radius-edge",
        type: "line",
        source: RADIUS,
        paint: {
          "line-color": accent,
          "line-opacity": LAYOUT.nearRing.edgeOpacity,
          "line-width": LAYOUT.nearRing.edgeWidth,
          "line-dasharray": [...LAYOUT.nearRing.dash],
        },
      },
    );
    return style;
  }, []);

  return (
    <MapView
      className={labels ? "map-canvas labels" : "map-canvas"}
      loadStyle={loadStyle}
      workerUrl={WORKER_URL}
      onStatus={props.onStatus}
      startupMs={props.startupMs}
      options={{
        center: HYDERABAD_CENTRE,
        zoom: LAYOUT.zoom.default,
        minZoom: LAYOUT.zoom.min,
        maxZoom: LAYOUT.zoom.max,
        // The style already credits OpenFreeMap, OpenMapTiles and OpenStreetMap; it collapses to an info button on phones.
        attributionControl: { compact: isPhone() },
        fadeDuration: reduceMotion() ? 0 : LAYOUT.motion.fast,
      }}
    >
      <MapEngine {...props} labels={labels} onLabels={setLabels} />
    </MapView>
  );
}

/** The Near me circle: it follows the location state, with the radius live, and is empty while Near me is off. */
function RadiusRing({ location }: { location: Location }) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    (map.getSource(RADIUS) as GeoJSONSource | undefined)?.setData(radiusData(location));
    map.getContainer().dataset.ring = location.kind === "on" ? String(location.km) : "";
  }, [map, isLoaded, location]);
  return null;
}

/** Everything that needs the live map: its sources, the camera, the markers and what the viewport holds. */
function MapEngine(props: MapCanvasProps & { labels: boolean; onLabels: (on: boolean) => void }) {
  const { features, selectedVenue, location, labels, onLabels } = props;
  const { map, isLoaded } = useMap();
  const latest = useRef(props);
  latest.current = props;
  const lastCommand = useRef(0);
  const [marks, setMarks] = useState<Mark[]>([]);
  /** Counts settled moves: where tiles sit on screen changes with every move, so the declutter pass runs again after each. */
  const [settled, setSettled] = useState(0);
  /** Cluster ids are only meaningful for one version of the source, so the version is part of their key. */
  const revision = useRef(0);

  const moveTo = (center: [number, number], zoom?: number) => {
    const camera = { center, zoom: zoom ?? map!.getZoom(), padding: latest.current.padding() };
    if (reduceMotion()) map!.jumpTo(camera);
    else map!.easeTo({ ...camera, duration: LAYOUT.motion.camera });
  };
  /** Camera moves only ever use exact points: an approximate venue has no marker, so nothing flies to it (DESIGN.md). */
  const exact = (venueId: string) => {
    const f = latest.current.features.find((x) => x.properties.venueId === venueId);
    return f && f.properties.precision === "exact" ? f : null;
  };
  const fit = useEffectEvent(() => {
    const list = latest.current.features.filter((f) => f.properties.precision === "exact");
    if (!list.length) return;
    const first = list[0]!.geometry.coordinates;
    const bounds = list.reduce((b, f) => b.extend(f.geometry.coordinates), new LngLatBounds(first, first));
    map!.fitBounds(bounds, {
      padding: { ...latest.current.padding(), top: 80, left: 40 },
      maxZoom: LAYOUT.zoom.selectMax,
      animate: !reduceMotion(),
      duration: LAYOUT.motion.camera,
    });
  });
  /** Opening a venue or an event centres it at zoom 15 or closer, so its label shows. */
  const focus = useEffectEvent((venueId: string) => {
    const f = exact(venueId);
    if (f) moveTo(f.geometry.coordinates, Math.max(map!.getZoom(), LAYOUT.zoom.focus));
  });
  /** Loading a URL that selects a venue eases to it (zoom 13 to 14) unless it is already in view. */
  const reveal = useEffectEvent((venueId: string) => {
    const f = exact(venueId);
    if (!f) return;
    const pad = latest.current.padding();
    const at = map!.project(f.geometry.coordinates);
    const { clientWidth: w, clientHeight: h } = map!.getContainer();
    if (at.x > pad.left && at.x < w - pad.right && at.y > pad.top && at.y < h - pad.bottom) return;
    const zoom = map!.getZoom();
    moveTo(f.geometry.coordinates, Math.min(Math.max(zoom, LAYOUT.zoom.selectMin), Math.max(zoom, LAYOUT.zoom.selectMax)));
  });
  /** Frames the Near me circle with the reader's dot dead centre of the visible map: the same margin on every side. */
  const fitRadius = useEffectEvent(() => {
    const loc = latest.current.location;
    if (loc.kind !== "on") return;
    const { lat, lng } = loc.origin;
    const dLat = loc.km / 111.32;
    const dLng = dLat / Math.cos((lat * Math.PI) / 180);
    const pad = latest.current.padding();
    const margin = LAYOUT.nearKm.frameMargin;
    map!.fitBounds(
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat + dLat],
      ],
      {
        padding: { top: pad.top + margin, right: pad.right + margin, bottom: pad.bottom + margin, left: pad.left + margin },
        animate: !reduceMotion(),
        duration: LAYOUT.motion.camera,
      },
    );
  });

  /** Reads what MapLibre has drawn and reports it: which markers exist, the zoom, the unobscured bounds. */
  const refresh = useEffectEvent(() => {
    if (!map) return;
    const visible = new Set(latest.current.features.map((f) => f.properties.venueId));
    const out: Mark[] = [];
    const drawn = new Set<string>();
    if (map.getSource(SOURCE)) {
      for (const rendered of map.querySourceFeatures(SOURCE)) {
        const p = rendered.properties as {
          cluster?: boolean;
          cluster_id?: number;
          point_count?: number;
          events?: number;
          venueId?: string;
        };
        const lngLat = (rendered.geometry as { coordinates: number[] }).coordinates as [number, number];
        if (p.cluster) {
          const key = `c${p.cluster_id}@${revision.current}`;
          if (drawn.has(key)) continue;
          drawn.add(key);
          out.push({ key, kind: "cluster", clusterId: p.cluster_id!, venues: p.point_count!, events: p.events!, lngLat });
        } else if (p.venueId && visible.has(p.venueId) && !drawn.has(p.venueId)) {
          drawn.add(p.venueId);
          out.push({ key: p.venueId, kind: "venue", venueId: p.venueId, lngLat });
        }
      }
    }
    setMarks((prev) =>
      prev.length === out.length &&
      prev.every((m, i) => m.key === out[i]!.key && m.lngLat[0] === out[i]!.lngLat[0] && m.lngLat[1] === out[i]!.lngLat[1])
        ? prev
        : out,
    );
    onLabels(map.getZoom() >= LAYOUT.labelZoom);
    setSettled((n) => n + 1);

    const pad = latest.current.padding();
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const nw = map.unproject([pad.left, pad.top]);
    const se = map.unproject([Math.max(w - pad.right, pad.left + 1), Math.max(h - pad.bottom, pad.top + 1)]);
    latest.current.onViewport({ west: nw.lng, north: nw.lat, east: se.lng, south: se.lat });
    latest.current.onBearing(map.getBearing());
  });

  useEffect(() => {
    if (!map || !isLoaded) return;
    const onSource = (event: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (event.sourceId === SOURCE && event.isSourceLoaded) refresh();
    };
    const onMoveEnd = () => refresh();
    map.on("moveend", onMoveEnd);
    map.on("sourcedata", onSource);
    map.on("click", () => {
      if (latest.current.selectedVenue) latest.current.onSelect(null);
    });
    refresh();
    if (latest.current.selectedVenue) reveal(latest.current.selectedVenue);
    return () => {
      map.off("moveend", onMoveEnd);
      map.off("sourcedata", onSource);
    };
  }, [map, isLoaded]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    revision.current += 1;
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(sourceData(features));
    refresh();
  }, [features, map, isLoaded]);
  // On phones the attribution is the info button until it is tapped (DESIGN.md, Layout): MapLibre opens a compact one at start.
  useEffect(() => {
    if (!map || !isLoaded || !isPhone()) return;
    const el = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
    el?.classList.remove("maplibregl-compact-show");
    el?.removeAttribute("open");
  }, [map, isLoaded]);
  useEffect(() => {
    const command = props.command;
    if (!map || !isLoaded || !command || command.seq === lastCommand.current) return;
    lastCommand.current = command.seq;
    const { request } = command;
    if (request.kind === "fit") fit();
    else if (request.kind === "refresh") refresh();
    else if (request.kind === "focus") focus(request.venueId);
    else if (request.kind === "zoom")
      (request.by > 0 ? map.zoomIn : map.zoomOut).call(map, { duration: reduceMotion() ? 0 : LAYOUT.motion.camera });
    else if (request.kind === "north") map.resetNorth({ duration: reduceMotion() ? 0 : LAYOUT.motion.camera });
    else fitRadius();
  }, [props.command, map, isLoaded]);

  // Tab order is reading order: the markers on screen first, top to bottom and then left to right, and the ones MapLibre has
  // drawn just outside the view after them. Markers are added to the page as they appear, so their DOM order is the order
  // MapLibre met them in; this puts them in the order a reader would scan the map, after every settled change.
  useEffect(() => {
    if (!map) return;
    const frame = map.getContainer().getBoundingClientRect();
    const els = [...map.getContainer().querySelectorAll<HTMLElement>(".mk")];
    const key = new globalThis.Map(
      els.map((el) => {
        const box = el.getBoundingClientRect();
        const inside = box.bottom > frame.top && box.top < frame.bottom && box.right > frame.left && box.left < frame.right;
        return [el, [inside ? 0 : 1, Math.round(box.top), Math.round(box.left)]] as const;
      }),
    );
    const sorted = [...els].sort(
      (a, b) => key.get(a)![0]! - key.get(b)![0]! || key.get(a)![1]! - key.get(b)![1]! || key.get(a)![2]! - key.get(b)![2]!,
    );
    if (sorted.every((el, i) => el === els[i])) return;
    // Moving a node drops its focus and its hover, so a marker the reader is on is never moved from under them: the order is put
    // right the next time the map settles with nothing focused or pointed at.
    if (els.some((el) => el.contains(document.activeElement) || el.matches(":hover"))) return;
    for (const el of sorted) el.parentElement?.append(el);
  }, [map, marks, settled]);

  // Declutter, once per settled change: read every box first, decide, then write one attribute per label. It runs after
  // the markers are in the DOM (children's effects come first).
  useEffect(() => {
    if (!map) return;
    const els = [...map.getContainer().querySelectorAll<HTMLElement>(".mk")];
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const solid = els.flatMap((el) => [...el.querySelectorAll(".tile, .cluster")].map((t) => ({ el, box: t.getBoundingClientRect() })));
    const rank = (label: Element) => (label.closest(".sel") ? 0 : label.closest(".cluster") ? 1 : 2);
    const entries = els
      .flatMap((el) => [...el.querySelectorAll<HTMLElement>(".label")].map((label) => ({ el, label })))
      .filter(({ label }) => getComputedStyle(label).display !== "none")
      .map((entry) => ({ ...entry, box: entry.label.getBoundingClientRect(), rank: rank(entry.label) }))
      .sort((a, b) => a.rank - b.rank);
    const shown: DOMRect[] = [];
    const hidden = new Set<HTMLElement>();
    for (const { el, label, box, rank: priority } of entries) {
      // The selected venue's label is always shown (DESIGN.md, Label chip); it is first in line, so the others give way to it.
      if (priority !== 0 && (solid.some((s) => s.el !== el && hit(s.box, box)) || shown.some((s) => hit(s, box)))) hidden.add(label);
      else shown.push(box);
    }
    for (const { label } of entries) label.toggleAttribute("data-hidden", hidden.has(label));
  }, [map, marks, labels, settled, features, selectedVenue]);

  const byId = new globalThis.Map(features.map((f) => [f.properties.venueId, f]));
  const openCluster = async (mark: Extract<Mark, { kind: "cluster" }>) => {
    const zoom = await (map!.getSource(SOURCE) as GeoJSONSource).getClusterExpansionZoom(mark.clusterId);
    moveTo(mark.lngLat, zoom);
  };

  return (
    <>
      {marks.map((mark) => {
        if (mark.kind === "cluster") {
          return (
            <MapMarker key={mark.key} longitude={mark.lngLat[0]} latitude={mark.lngLat[1]} className="mk">
              <MarkerContent>
                <ClusterMarker venues={mark.venues} events={mark.events} onOpen={() => openCluster(mark)} />
              </MarkerContent>
            </MapMarker>
          );
        }
        const feature = byId.get(mark.venueId);
        return feature ? (
          <MapMarker key={mark.key} longitude={mark.lngLat[0]} latitude={mark.lngLat[1]} className="mk">
            <MarkerContent>
              <VenueMarker feature={feature} selected={selectedVenue === mark.venueId} onSelect={props.onSelect} />
            </MarkerContent>
          </MapMarker>
        ) : null;
      })}
      <RadiusRing location={location} />
      {location.kind === "on" ? (
        <MapMarker key="me" longitude={location.origin.lng} latitude={location.origin.lat} className="mk">
          <MarkerContent>
            <LocationDot />
          </MarkerContent>
        </MapMarker>
      ) : null}
    </>
  );
}
