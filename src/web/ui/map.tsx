/**
 * Map components adapted from mapcn (https://www.mapcn.dev, https://github.com/AnmolSaini16/mapcn, MIT licence,
 * Copyright (c) 2025 Anmoldeep Singh). Source: https://mapcn.dev/r/map.json, the registry build of `src/registry/map.tsx`,
 * repository commit d160bd7 (2026-09-06), fetched 2026-10-11, sha256 1817e5f387d4... of the JSON.
 *
 * Kept from mapcn: the `MapView` component (container (mapcn calls it `Map`, which shadows the global), MapLibre lifecycle, a context with the live map, theme detection that
 * follows the document and the OS), `useMap`, and `MapMarker` with `MarkerContent` (a MapLibre marker whose content is a
 * React portal). Adapted:
 *  - The basemap is not a URL. `loadStyle(theme)` returns a style specification (OpenFreeMap with our repaint and our
 *    sources, built by the caller), so the map waits for it before it exists and a theme change loads the new style first.
 *  - Only the newest theme request is applied, and a style that fails to load leaves the one on screen (mapcn swaps blindly).
 *  - Theme detection falls back to the OS when the document stops naming a theme (mapcn keeps the last one).
 *  - The worker URL is ours, from the caller, not unpkg; there is no Carto default.
 *  - Startup is bounded: `startupMs` and a style `error` report `failed` through `onStatus`, the list stays on screen.
 *  - Markers take a class for their element (our tile CSS positions on it) and render their children as given, with no
 *    wrapper; popups, tooltips, labels, dragging, controls, routes, arcs, GeoJSON layers and the cluster layer are left out.
 *    (The cluster layer draws circles; DESIGN.md wants stacked tiles with a caption, which are DOM markers.)
 *  - MapLibre is imported by name, so the bundler drops what is unused; this module is only reached through a dynamic import.
 */

import { cn } from "@web/ui/lib/utils";
import { Map as MapLibre, type MapOptions, Marker, type StyleSpecification, setWorkerUrl } from "maplibre-gl";
import { createContext, forwardRef, type ReactNode, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MapTheme = "light" | "dark";

function getDocumentTheme(): MapTheme | null {
  const chosen = document.documentElement.dataset.theme;
  return chosen === "light" || chosen === "dark" ? chosen : null;
}
const getSystemTheme = (): MapTheme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** The theme in effect: the document's `data-theme` when it names one, else the OS. Follows both. */
export function useResolvedTheme(themeProp?: MapTheme): MapTheme {
  const [detected, setDetected] = useState<MapTheme>("light");
  useEffect(() => {
    if (themeProp) return;
    const read = () => setDetected(getDocumentTheme() ?? getSystemTheme());
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const query = matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", read);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", read);
    };
  }, [themeProp]);
  return themeProp ?? detected;
}

interface MapContextValue {
  map: MapLibre | null;
  isLoaded: boolean;
  resolvedTheme: MapTheme;
}
const MapContext = createContext<MapContextValue | null>(null);

export function useMap(): MapContextValue {
  const context = useContext(MapContext);
  if (!context) throw new Error("useMap must be used within a MapView component");
  return context;
}

export type MapRef = MapLibre;

export interface MapProps {
  children?: ReactNode;
  className?: string;
  theme?: MapTheme;
  /** The basemap for a theme, as a style specification. Called once at startup and again when the theme changes. */
  loadStyle: (theme: MapTheme) => Promise<StyleSpecification>;
  /** Where MapLibre starts its worker from. */
  workerUrl: string;
  /** How long the map may take to load before it is reported as failed. */
  startupMs?: number;
  onStatus?: (status: "ready" | "failed") => void;
  options?: Omit<MapOptions, "container" | "style">;
}

export const MapView = forwardRef<MapRef, MapProps>(function MapView(
  { children, className, theme: themeProp, loadStyle, workerUrl, startupMs = 20_000, onStatus, options },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const [instance, setInstance] = useState<MapLibre | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const resolvedTheme = useResolvedTheme(themeProp);
  const latest = useRef({ loadStyle, onStatus, options, resolvedTheme, startupMs, workerUrl });
  latest.current = { loadStyle, onStatus, options, resolvedTheme, startupMs, workerUrl };
  const applied = useRef<MapTheme | null>(null);
  /** The style specification on screen, kept so a replacement that fails can be undone. */
  const onScreenStyle = useRef<StyleSpecification | null>(null);
  /** The theme whose basemap is on screen, for the page and its tests (`data-basemap`). */
  const [onScreen, setOnScreen] = useState<MapTheme | null>(null);
  const request = useRef(0);

  useImperativeHandle(ref, () => instance as MapLibre, [instance]);

  // Create the map once; any failure is reported and leaves the page's own list in place.
  useEffect(() => {
    let disposed = false;
    let created: MapLibre | null = null;
    const fail = () => {
      if (!disposed) latest.current.onStatus?.("failed");
    };
    // Only the first load is fatal when a style or source is missing. After that, MapLibre reports a source or tile that fails to
    // load as an error too (a theme change whose basemap 404s, a tile that times out), and those must not take the map down.
    let started = false;
    const timer = setTimeout(fail, latest.current.startupMs);
    (async () => {
      try {
        setWorkerUrl(latest.current.workerUrl);
        const initial = getDocumentTheme() ?? getSystemTheme();
        const style = await latest.current.loadStyle(initial);
        if (disposed) return;
        applied.current = initial;
        onScreenStyle.current = style;
        setOnScreen(initial);
        created = new MapLibre({
          renderWorldCopies: false,
          attributionControl: { compact: true },
          ...latest.current.options,
          container: container.current!,
          style,
        });
        created.on("error", (event) => {
          if (!started && /style|404|Failed to fetch/i.test(String(event.error?.message ?? ""))) fail();
        });
        // A lost WebGL context is the one failure after startup that leaves nothing to draw: give the page its list back.
        created.getCanvas().addEventListener("webglcontextlost", fail);
        setInstance(created);
        await new Promise<void>((resolve) => created!.once("load", () => resolve()));
        if (disposed) return;
        clearTimeout(timer);
        started = true;
        setIsLoaded(true);
        latest.current.onStatus?.("ready");
      } catch (error) {
        console.error("Map failed to start", error);
        fail();
      }
    })();
    return () => {
      disposed = true;
      clearTimeout(timer);
      created?.remove();
      setIsLoaded(false);
      setInstance(null);
    };
  }, []);

  // A new theme: load the style first, apply only the newest answer, and keep the style on screen if the load fails.
  useEffect(() => {
    if (!instance || !isLoaded) return;
    // Every change of theme, including back to the one on screen, retires the request still in flight.
    const id = ++request.current;
    if (resolvedTheme === applied.current) return;
    latest.current
      .loadStyle(resolvedTheme)
      .then((style) => {
        if (id !== request.current) return;
        const before = { theme: applied.current, style: onScreenStyle.current };
        applied.current = resolvedTheme;
        onScreenStyle.current = style;
        setOnScreen(resolvedTheme);
        instance.setStyle(style, { diff: false });
        // A style that arrives but whose own sources or sprites then fail would leave a map with nothing drawn. Until the new style
        // has settled (`idle`), the first error puts the working basemap back; after that errors are tiles being tiles.
        const settle = () => {
          instance.off("error", revert);
        };
        const revert = () => {
          settle();
          instance.off("idle", settle);
          if (id !== request.current || !before.style) return;
          applied.current = before.theme;
          onScreenStyle.current = before.style;
          setOnScreen(before.theme);
          instance.setStyle(before.style, { diff: false });
        };
        instance.on("error", revert);
        instance.once("idle", settle);
      })
      .catch(() => {});
  }, [instance, isLoaded, resolvedTheme]);

  const value = useMemo(() => ({ map: instance, isLoaded, resolvedTheme }), [instance, isLoaded, resolvedTheme]);
  return (
    <MapContext.Provider value={value}>
      <div ref={container} className={cn("relative h-full w-full", className)} data-basemap={onScreen ?? undefined}>
        {instance ? children : null}
      </div>
    </MapContext.Provider>
  );
});

const MarkerContext = createContext<Marker | null>(null);

export interface MapMarkerProps {
  longitude: number;
  latitude: number;
  /** Class of the element MapLibre positions. */
  className?: string;
  children: ReactNode;
}

/** A MapLibre marker that lives as long as this component does: it is added to the map on mount, moved when its position changes and removed on unmount. */
export function MapMarker({ longitude, latitude, className, children }: MapMarkerProps) {
  const { map } = useMap();
  // The marker is made once; its position is synced below.
  const [marker] = useState(() => {
    const element = document.createElement("div");
    if (className) element.className = className;
    return new Marker({ element }).setLngLat([longitude, latitude]);
  });

  useEffect(() => {
    if (!map) return;
    marker.addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, marker]);

  useEffect(() => {
    const at = marker.getLngLat();
    if (at.lng !== longitude || at.lat !== latitude) marker.setLngLat([longitude, latitude]);
  }, [marker, longitude, latitude]);

  return <MarkerContext.Provider value={marker}>{children}</MarkerContext.Provider>;
}

/** The marker's content, as a portal into the element MapLibre positions. */
export function MarkerContent({ children }: { children: ReactNode }) {
  const marker = useContext(MarkerContext);
  if (!marker) throw new Error("MarkerContent must be used within MapMarker");
  return createPortal(children, marker.getElement());
}
