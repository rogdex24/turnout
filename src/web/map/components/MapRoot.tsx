import { NuqsAdapter } from "nuqs/adapters/react";
import { MapApp, type MapBoot } from "./MapApp.js";

/**
 * MapApp inside the nuqs adapter. `serverSearch` is the request's query string: the server renders from it and the browser
 * hydrates from the same string, so the first client render matches; after that the adapter reads the live URL.
 */
export function MapRoot({ search, ...boot }: MapBoot) {
  return (
    <NuqsAdapter serverSearch={search}>
      <MapApp {...boot} />
    </NuqsAdapter>
  );
}
