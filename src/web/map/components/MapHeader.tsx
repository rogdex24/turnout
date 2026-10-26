import { Brand } from "@web/ui/components/brand";
import { ViewSwitch } from "@web/ui/components/view-switch";
import { listHref, mapHref } from "../../viewLinks.js";
import type { MapFilters } from "../model/filters.js";
import { SearchBox } from "./FilterBar.js";
import { ThemeToggle } from "./ThemeToggle.js";

/** The top row: brand, search, List / Map, theme. One wrapping flex row, so nothing can sit on top of anything else. */
export function MapHeader({ filters }: { filters: MapFilters }) {
  return (
    <header className="map-top">
      <a className="brand-link" href="/">
        <Brand />
      </a>
      <SearchBox filters={filters} />
      <ViewSwitch current="map" list={listHref(filters)} map={mapHref(filters)} />
      <ThemeToggle />
    </header>
  );
}
