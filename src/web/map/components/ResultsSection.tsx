import { AccordionContent, AccordionItem, AccordionTrigger } from "@web/ui/components/accordion";
import { LAYOUT } from "../layout.js";
import type { MapFilters, Ranked } from "../model/filters.js";
import { formatDate, kmText, plural } from "../model/format.js";
import type { EventGroup } from "../model/group.js";
import { at, type Selection, venueOf } from "../model/selection.js";
import type { MapCollection } from "../types.js";
import { CategoryTag } from "./CategoryIcon.js";
import { EventRow } from "./EventRow.js";
import { NavLink } from "./nav.js";
import { VenueTag, whereLine } from "./VenueDetail.js";

type Organisers = MapCollection["organisers"];

/** A type or day group: the whole header is the accordion trigger (DESIGN.md, Panel list). */
export function GroupSection({
  group,
  by,
  filters,
  selection,
  organisers,
}: {
  group: EventGroup;
  by: "type" | "day";
  filters: MapFilters;
  selection: Selection;
  organisers: Organisers;
}) {
  const { key, items } = group;
  return (
    <AccordionItem value={`${by}:${key}`} className="group" data-section={`${by}:${key}`}>
      <AccordionTrigger className="trigger">
        <span className="gh">
          {by === "type" ? <CategoryTag category={key} size={LAYOUT.categoryIcon.heading} /> : formatDate(`${key}T12:00:00+05:30`)}
          <span className="muted">· {items.length}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <ul className="rows">
          {items.map(({ event, feature, km }) => (
            <EventRow
              key={event.id}
              event={event}
              feature={feature}
              filters={filters}
              selection={selection}
              organisers={organisers}
              context={{ kind: by, km }}
            />
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * A venue section. The venue name is a link that opens the venue, so it sits above the trigger, not inside it
 * (a link cannot live in a button); the trigger is the line below with the area, count and chevron.
 */
export function VenueSection({
  ranked,
  filters,
  selection,
  organisers,
}: {
  ranked: Ranked;
  filters: MapFilters;
  selection: Selection;
  organisers: Organisers;
}) {
  const { feature, km } = ranked;
  const { name, events, venueId } = feature.properties;
  return (
    <AccordionItem value={`venue:${venueId}`} className="venue" data-section={`venue:${venueId}`}>
      <h3 className="vn">
        <NavLink to={at(filters, venueOf(venueId))} focus={{ venue: venueId }} data-venue={venueId}>
          {name}
        </NavLink>
      </h3>
      <AccordionTrigger className="trigger" plainHeader>
        <span className="meta">
          {whereLine(feature)} · {plural(events.length, "event")}
          {km != null ? ` · ${kmText(km)}` : ""}
          <VenueTag events={events} />
        </span>
      </AccordionTrigger>
      <AccordionContent>
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
      </AccordionContent>
    </AccordionItem>
  );
}
