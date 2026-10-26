import { CalendarPlus, ExternalLink, MapPin, X } from "lucide-react";
import type { ReactElement } from "react";
import { DEFAULT_FILTERS, type MapFilters } from "../model/filters.js";
import { formatClock, formatDate, hashStep, humanize, initials, kmText, plural, trustLine } from "../model/format.js";
import { at, type Selection, selectedEvent } from "../model/selection.js";
import type { MapCollection, MapEvent, MapFeature } from "../types.js";
import { CategoryTag } from "./CategoryIcon.js";
import { EventImage } from "./EventImage.js";
import { Icon } from "./Icon.js";
import { NavLink } from "./nav.js";

/**
 * Where a row is shown, which decides what it says. In a type list the category is the section's, so the row leaves it out and
 * names its venue (with the distance when Near me is on); in a day list the row keeps the category and names its venue; under a
 * venue (its section, or its card) the venue is the context and the row keeps the category. These are the only three.
 */
export type RowContext = { kind: "type"; km: number | null } | { kind: "day"; km: number | null } | { kind: "venue" };
const Sep = () => (
  <span className="m-sep" aria-hidden="true">
    {" "}
    ·{" "}
  </span>
);

/** Each part has its own quiet style (DESIGN.md, Event row) so date, time, price and category read apart at a glance. */
function MetaLine({ event, withCategory }: { event: MapEvent; withCategory: boolean }) {
  const parts = [
    <span key="d" className="m-date">
      {formatDate(event.startsAt)}
    </span>,
    event.timeKind === "timed" ? (
      <span key="t" className="m-time">
        {formatClock(event.startsAt)}
      </span>
    ) : null,
    event.isFree ? (
      <span key="p" className="m-price">
        Free
      </span>
    ) : event.priceMin != null ? (
      <span key="p" className="m-price">
        <span className="m-from">from</span> ₹{event.priceMin}
      </span>
    ) : null,
    withCategory ? <CategoryTag key="c" category={event.category} /> : null,
  ].filter((part): part is ReactElement => part !== null);
  return (
    <>
      {parts.map((part, i) => (
        <span key={part.key}>
          {i > 0 ? <Sep /> : null}
          {part}
        </span>
      ))}
    </>
  );
}

function Organiser({ event, feature, organisers }: { event: MapEvent; feature: MapFeature; organisers: MapCollection["organisers"] }) {
  const name = event.organiser ?? feature.properties.name;
  const trust = event.organiser ? organisers[event.organiser] : feature.properties.trust;
  const line = trust ? trustLine(trust) : "";
  return (
    <div className="organiser">
      <span className="avatar" style={{ "--ph": `var(--ph-${hashStep(name)})` } as React.CSSProperties} aria-hidden="true">
        {initials(name)}
      </span>
      <span>
        <strong>{name}</strong>
        {event.organiser ? null : (
          <>
            <br />
            <span className="muted">Venue</span>
          </>
        )}
        {line ? (
          <>
            <br />
            <span className="muted">{line}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}

/**
 * A row is a link that opens or closes the event (DESIGN.md, Focus). Closed, it is a thumbnail and up to three lines. Open, the
 * row is a card: the same link becomes the close button over the cover, so there is one image and one control, and focus stays
 * on that element. The open card names its region with aria-controls.
 */
export function EventRow({
  event,
  feature,
  filters,
  selection,
  organisers,
  context,
}: {
  event: MapEvent;
  feature: MapFeature;
  filters: MapFilters;
  selection: Selection;
  organisers: MapCollection["organisers"];
  context: RowContext;
}) {
  const open = selectedEvent(selection) === event.publicId;
  const withCategory = context.kind !== "type";
  const venueLine = context.kind === "venue" ? null : { km: context.km };
  const venueId = feature.properties.venueId;
  const more = event.moreDates > 0 ? ` · +${plural(event.moreDates, "more date")}` : "";
  const region = `ex-${event.publicId}`;
  const source = event.source.charAt(0).toUpperCase() + event.source.slice(1);
  return (
    <li className={open ? "row open" : "row"}>
      <NavLink
        className={open ? "close" : "row-head"}
        to={at(filters, open ? { kind: "venue", venueId } : { kind: "event", venueId, eventId: event.publicId })}
        focus={{ event: event.publicId }}
        data-event={event.publicId}
        data-venue={venueId}
        aria-expanded={open}
        aria-controls={open ? region : undefined}
        aria-label={open ? `Close ${event.title}` : event.title}
        // The title is the name; when and where, and what it costs, are the description (not the name repeated).
        aria-describedby={open ? undefined : venueLine ? `rm-${event.publicId} rv-${event.publicId}` : `rm-${event.publicId}`}
      >
        {open ? (
          <Icon as={X} />
        ) : (
          <>
            <EventImage event={event} kind="thumb" />
            <span className="body">
              <strong className="rt">{event.title}</strong>
              <span className="meta" id={`rm-${event.publicId}`}>
                <MetaLine event={event} withCategory={withCategory} />
                {more}
              </span>
              {venueLine ? (
                <span className="meta m-venue" id={`rv-${event.publicId}`}>
                  <Icon as={MapPin} size={13} />
                  {feature.properties.name}
                  {venueLine.km != null ? (
                    <>
                      <Sep />
                      {kmText(venueLine.km)}
                    </>
                  ) : null}
                </span>
              ) : null}
            </span>
          </>
        )}
      </NavLink>
      {open ? (
        <section className="expanded" id={region} aria-labelledby={`et-${event.publicId}`}>
          <EventImage event={event} kind="cover" />
          <div className="xbody">
            <h3 className="et" id={`et-${event.publicId}`}>
              {event.title}
            </h3>
            <p className="meta">
              <MetaLine event={event} withCategory={withCategory} />
              {more}
            </p>
            <Organiser event={event} feature={feature} organisers={organisers} />
            <div className="actions">
              {event.sourceUrl ? (
                <a className="button primary" href={event.sourceUrl} rel="noopener noreferrer" target="_blank">
                  View on {source}
                  <Icon as={ExternalLink} />
                </a>
              ) : null}
              <a className="button secondary" href={`/e/${event.publicId}.ics`}>
                <Icon as={CalendarPlus} />
                Add to calendar
              </a>
              <a className="link" href={`/e/${event.publicId}`}>
                Details
              </a>
            </div>
            <p className="meta credit">Cover and details from {source}</p>
          </div>
        </section>
      ) : null}
    </li>
  );
}

export { DEFAULT_FILTERS, humanize };
