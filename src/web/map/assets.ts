import fs from "node:fs";
import type { BunPlugin } from "bun";
import tailwind from "bun-plugin-tailwind";

/**
 * The /map browser bundle. Built once per process, on first use, straight from
 * client.tsx with Bun.build, so there is no build step to forget and the
 * listing pages never reference any of it. The MapLibre worker is a separate
 * file because MapLibre starts it by URL.
 */
export interface MapAssets {
  js: string;
  css: string;
  /** Chunks fetched only when something is used (the Filters popover, the distance slider). Everything else loads with the page. */
  onDemand: Set<string>;
  /** The on-demand chunks a phone fetches at load anyway: the sheet and what it imports. */
  phone: Set<string>;
  files: Map<string, { body: Uint8Array<ArrayBuffer>; type: string }>;
}

const WORKER_SOURCE = new URL("../../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url);

let built: MapAssets | null = null;

/**
 * MapLibre's stylesheet carries data-URI icons for controls we do not use (zoom, compass, fullscreen, geolocate, globe), the
 * popup, the scale and the control group. The map's chrome is ours (DESIGN.md, Chrome layout), so those rules go: about 7 KB
 * gzipped. What stays is the map, canvas, markers, attribution (its info button is an icon) and the control corners.
 */
const UNUSED_MAPLIBRE_RULE =
  /popup|scale|ctrl-logo|ctrl-group|ctrl-icon|ctrl-zoom|ctrl-compass|ctrl-geolocate|ctrl-fullscreen|ctrl-shrink|ctrl-globe|ctrl-terrain|ctrl-pitch|user-location|-ctrl button/;
export const trimMaplibreCss = (css: string): string =>
  css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selector: string) => (UNUSED_MAPLIBRE_RULE.test(selector) ? "" : rule));
const trimMaplibre: BunPlugin = {
  name: "trim-maplibre-css",
  setup(build) {
    build.onLoad({ filter: /maplibre-gl\.css$/ }, async (args) => ({
      contents: trimMaplibreCss(await Bun.file(args.path).text()),
      loader: "css",
    }));
  },
};

/** Called once before the server starts listening. A failed build leaves /map as the no-JavaScript page. */
export async function buildMapAssets(): Promise<MapAssets | null> {
  try {
    built = await build();
  } catch (error) {
    console.error("Map bundle failed; /map will render without JavaScript:", error);
  }
  return built;
}

export const mapAssetsNow = (): MapAssets | null => built;

async function build(): Promise<MapAssets> {
  const result = await Bun.build({
    entrypoints: [new URL("./client.tsx", import.meta.url).pathname],
    target: "browser",
    minify: true,
    // React ships its production build; without this Bun bundles the development one (131 KB gzip vs 68).
    define: { "process.env.NODE_ENV": '"production"', WORKER_URL: JSON.stringify("/assets/maplibre-worker.js") },
    // The public Tailwind entry (src/web/ui/styles.css) is imported by the client.
    plugins: [trimMaplibre, tailwind],
    // Code behind a dynamic import (MapLibre, the Filters popover, the distance slider) becomes its own chunk, fetched when
    // first needed. The names carry a content hash, and entry and chunks reference each other by those names.
    splitting: true,
    metafile: true,
    naming: { entry: "map.[hash].[ext]", chunk: "chunk.[hash].[ext]", asset: "[name].[hash].[ext]" },
  });
  if (!result.success) throw new Error(result.logs.map(String).join("\n"));

  const files = new Map<string, { body: Uint8Array<ArrayBuffer>; type: string }>();
  let js = "";
  let css = "";
  for (const output of result.outputs) {
    const body = new Uint8Array(await output.arrayBuffer());
    const isCss = output.path.endsWith(".css");
    const path = `/assets/${output.path.split("/").pop()}`;
    files.set(path, { body, type: isCss ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8" });
    if (isCss) css = path;
    else if (output.kind === "entry-point") js = path;
  }
  // First load is the entry, the chunks it imports statically, and the map itself: MapCanvas (with mapcn's Map) and MapLibre,
  // which MapApp imports right after hydration, and whatever those import. Any other chunk sits behind a dynamic import that
  // waits for a click or a phone-sized screen, so it is on demand.
  const graph = result.metafile!.outputs as Record<
    string,
    { imports: Array<{ path: string; kind: string }>; inputs: Record<string, unknown> }
  >;
  const name = (path: string) => `/assets/${path.split("/").pop()}`;
  const byName = new Map(Object.entries(graph).map(([key, out]) => [name(key), out]));
  const isMap = (out: { inputs: Record<string, unknown> }) =>
    Object.keys(out.inputs).some((input) => input.includes("node_modules/maplibre-gl/") || input.endsWith("components/MapCanvas.tsx"));
  const eager = new Set<string>();
  const visit = (path: string) => {
    if (eager.has(path)) return;
    eager.add(path);
    for (const edge of byName.get(path)?.imports ?? []) if (edge.kind === "import-statement") visit(name(edge.path));
  };
  visit(js);
  for (const [path, out] of byName) if (path.endsWith(".js") && isMap(out)) visit(path);
  // The phone sheet chunk and what it pulls in statically: fetched by every phone, so counted in its first load.
  const phone = new Set<string>();
  const phoneVisit = (path: string) => {
    if (phone.has(path) || eager.has(path)) return;
    phone.add(path);
    for (const edge of byName.get(path)?.imports ?? []) if (edge.kind === "import-statement") phoneVisit(name(edge.path));
  };
  for (const [path, out] of byName)
    if (Object.keys(out.inputs).some((input) => input.endsWith("components/MobileSheet.tsx"))) phoneVisit(path);
  const onDemand = new Set([...byName.keys()].filter((path) => path.endsWith(".js") && !eager.has(path)));
  const worker = new Uint8Array(fs.readFileSync(WORKER_SOURCE));
  files.set("/assets/maplibre-worker.js", { body: worker, type: "text/javascript; charset=utf-8" });
  return { js, css, onDemand, phone, files };
}

export function assetResponse(path: string): Response | null {
  const file = built?.files.get(path);
  if (!file) return null;
  return new Response(file.body, {
    headers: {
      "content-type": file.type,
      // The hashed names never change content; the worker keeps a fixed name, so revalidate it.
      "cache-control": path.includes("worker") ? "public, max-age=3600" : "public, max-age=31536000, immutable",
    },
  });
}
