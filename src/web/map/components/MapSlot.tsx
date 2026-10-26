import { type ComponentType, useEffect, useEffectEvent, useState } from "react";
import type { MapCanvasProps } from "./MapCanvas.js";
import { SkeletonTiles } from "./Skeleton.js";

/** How long the map has to be ready, from the moment it is asked for (DESIGN.md, States). */
const STARTUP_MS = 20_000;

/**
 * The map's frame. It is in the main bundle and renders the same empty frame on the server and in the first client render;
 * MapCanvas (MapLibre, the markers) is its own chunk, fetched once the page has hydrated. `attempt` is bumped to try again
 * after a failure.
 */
export function MapSlot({ enabled, attempt, ...canvas }: MapCanvasProps & { enabled: boolean; attempt: number }) {
  const [Canvas, setCanvas] = useState<ComponentType<MapCanvasProps> | null>(null);
  const [left, setLeft] = useState(STARTUP_MS);
  const fail = useEffectEvent(() => canvas.onStatus("failed"));
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const began = Date.now();
    // One deadline for the whole startup: the chunk import counts against it, and what is left goes to the map's own timer.
    const timer = setTimeout(() => {
      if (current) fail();
    }, STARTUP_MS);
    import("./MapCanvas.js")
      .then((m) => {
        if (!current) return;
        clearTimeout(timer);
        setLeft(Math.max(STARTUP_MS - (Date.now() - began), 1));
        setCanvas(() => m.default);
      })
      .catch(() => {
        if (current) {
          clearTimeout(timer);
          fail();
        }
      });
    // A retired attempt (given up on, retried, or unmounted) can never put its map on the page: its late answer is ignored.
    return () => {
      current = false;
      clearTimeout(timer);
      setCanvas(null);
    };
  }, [enabled, attempt]);
  return (
    <section id="map" aria-label="Map of events">
      {!enabled ? <SkeletonTiles /> : Canvas ? <Canvas key={attempt} {...canvas} startupMs={left} /> : null}
    </section>
  );
}
