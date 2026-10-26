import { ArrowLeft, CalendarPlus, ExternalLink, Map as MapIcon } from "lucide-react";
import { formatIst, formatIstDate } from "../../utils/time.js";
import { CategoryTag } from "../map/components/CategoryIcon.js";
import { LAYOUT } from "../map/layout.js";
import { publicSourceUrl } from "../source-url.js";
import type { EventCard } from "../types.js";
import { Header } from "./Header.js";

const Glyph = ({ as: Icon }: { as: typeof MapIcon }) => (
  <Icon className="i" size={16} strokeWidth={1.75} aria-hidden="true" focusable="false" />
);

/** /e/<id>: what, when, where and price, with the way out to the source and to the calendar. Only listing-eligible events get one. */
export function Detail({ row }: { row: EventCard }) {
  const sourceUrl = publicSourceUrl(row.sourceUrl);
  const when = row.timeKind === "date-only" ? formatIstDate(row.startsAt) : formatIst(row.startsAt);
  const price = row.isFree ? "Free" : row.priceMin != null ? `₹${row.priceMin}` : "Price TBA";
  return (
    <>
      <Header />
      <a className="link back" href="/">
        <Glyph as={ArrowLeft} />
        Back to listing
      </a>
      <h1>{row.title}</h1>
      <dl>
        <dt>When</dt>
        <dd>{when}</dd>
        <dt>Where</dt>
        <dd>
          {row.venueName ?? "Venue TBA"}
          {row.address ? (
            <>
              <br />
              {row.address}
            </>
          ) : null}
        </dd>
        <dt>Price</dt>
        <dd>{price}</dd>
        <dt>Category</dt>
        <dd>
          <CategoryTag category={row.category} size={LAYOUT.categoryIcon.inline} />
        </dd>
      </dl>
      {row.description ? <p className="description">{row.description}</p> : null}
      <p className="actions">
        {sourceUrl ? (
          <a className="button primary source" href={sourceUrl} rel="noopener noreferrer">
            View source
            <Glyph as={ExternalLink} />
          </a>
        ) : null}
        <a className="button secondary" href={`/e/${row.publicId}.ics`}>
          <Glyph as={CalendarPlus} />
          Add to calendar
        </a>
        <a className="button secondary" href={`/map?event=${row.publicId}`}>
          <Glyph as={MapIcon} />
          Show on the map
        </a>
      </p>
    </>
  );
}

export function NotFound() {
  return (
    <>
      <Header />
      <h1>Not found</h1>
      <p>No event at this URL.</p>
      <p>
        <a className="link" href="/">
          Back to listing
        </a>
      </p>
    </>
  );
}
