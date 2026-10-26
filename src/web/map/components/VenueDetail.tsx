import { ArrowLeft } from "lucide-react";
import type { MapFilters } from "../model/filters.js";
import { humanize, plural, venueCategory } from "../model/format.js";
import { at, type Selection } from "../model/selection.js";
import type { MapCollection, MapFeature } from "../types.js";
import { CategoryTag } from "./CategoryIcon.js";
import { EventRow } from "./EventRow.js";
import { Icon } from "./Icon.js";
import { NavLink } from "./nav.js";

/** The area, flagged when the venue has no exact spot (it has no marker either). */
export const whereLine = ({ properties: { area, precision } }: MapFeature): string =>
  precision === "approximate" ? `~ ${humanize(area)}, exact spot not confirmed` : humanize(area);

/** " · Comedy" with its icon after a venue's count when all its events share a category. */
export function VenueTag({ events }: { events: MapFeature["properties"]["events"] }) {
  const category = venueCategory(events);
  return category ? (
    <>
      <span className="m-sep" aria-hidden="true">
        {" "}
        ·{" "}
      </span>
      <CategoryTag category={category} />
    </>
  ) : null;
}

/** One venue's card: back link, name, where, and its event rows (one possibly expanded). */
export function VenueDetail({
  feature,
  filters,
  selection,
  organisers,
}: {
  feature: MapFeature;
  filters: MapFilters;
  selection: Selection;
  organisers: MapCollection["organisers"];
}) {
  const { name, events, venueId } = feature.properties;
  return (
    <>
      <NavLink className="back link inset" to={at(filters)} focus={{ venue: venueId }}>
        <Icon as={ArrowLeft} />
        All events
      </NavLink>
      <h2 className="vh inset">{name}</h2>
      <p className="meta lede inset">
        {whereLine(feature)} · {plural(events.length, "event")}
        <VenueTag events={events} />
      </p>
      <ul className="rows">
        {events.map((e) => (
          <EventRow
            key={e.id}
            event={e}
            feature={feature}
            filters={filters}
            selection={selection}
            organisers={organisers}
            context={{ kind: "venue" }}
          />
        ))}
      </ul>
    </>
  );
}
