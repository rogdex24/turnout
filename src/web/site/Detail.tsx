import { ArrowLeft, CalendarPlus, ExternalLink, Map as MapIcon, Users } from "lucide-react";
import { formatIst, formatIstDate } from "../../utils/time.js";
import { CategoryTag } from "../map/components/CategoryIcon.js";
import { LAYOUT } from "../map/layout.js";
import { publicSourceUrl } from "../source-url.js";
import type { EventCard } from "../types.js";
import { Header } from "./Header.js";

const Glyph = ({ as: Icon }: { as: typeof MapIcon }) => (
  <Icon className="i" size={16} strokeWidth={1.75} aria-hidden="true" focusable="false" />
);

export const GROUP_BLURB = "Meet 3 to 5 others with tickets at a cafe nearby, an hour before.";

/**
 * /e/<id>: what, when, where and price, with the way out to the source and to the calendar. Only listing-eligible events get one.
 * `groupLink` is the "Go with a group" link, or null when the show cannot have a group or the go host is not set.
 */
export function Detail({ row, groupLink }: { row: EventCard; groupLink: string | null }) {
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
      {groupLink ? (
        <section className="go-group" aria-label="Go with a group">
          <a className="button secondary" href={groupLink}>
            <Glyph as={Users} />
            Go with a group
          </a>
          <p className="lede">{GROUP_BLURB}</p>
        </section>
      ) : null}
    </>
  );
}

/**
 * /e/<id>/go: where a "Go with a group" link lands on a phone without the app. The title, one sentence, the Play link once the app is
 * public (before that a line saying it is in testing, and a way to write to us), and the way back. There is no App Store link.
 */
export function GoFallback({
  row,
  playStoreUrl,
  contactEmail,
}: {
  row: EventCard;
  playStoreUrl: string | null;
  contactEmail: string | null;
}) {
  return (
    <>
      <Header />
      <a className="link back" href={`/e/${row.publicId}`}>
        <Glyph as={ArrowLeft} />
        Back to the event
      </a>
      <h1>{row.title}</h1>
      <p>Go with a group is in the Turnout app. {GROUP_BLURB}</p>
      {playStoreUrl ? (
        <p className="actions">
          <a className="button primary" href={playStoreUrl} rel="noopener noreferrer">
            Get it on Google Play
            <Glyph as={ExternalLink} />
          </a>
        </p>
      ) : (
        <div className="card app-status">
          <p>The app is in testing on Android.</p>
          {contactEmail ? (
            <p>
              <a className="link" href={`mailto:${contactEmail}`}>
                Contact us
              </a>
            </p>
          ) : null}
        </div>
      )}
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
