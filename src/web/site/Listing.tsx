import { AREAS } from "../../catalog/area.js";
import { CATEGORIES, categoryLabel } from "../../catalog/category.js";
import { formatIst, formatIstDate, nextSevenDaysIst, weekendRangeIst } from "../../utils/time.js";
import { CategoryTag } from "../map/components/CategoryIcon.js";
import type { FacetCounts, ListingEntry, ListingFilters } from "../types.js";
import { listHref, mapHref } from "../viewLinks.js";
import { Header } from "./Header.js";

/** Turns "hitec-city" into "Hitec City" and "bookmyshow" into "Bookmyshow". */
const humanize = (slug: string): string => slug.replace(/[-_]/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

/** A labelled dropdown whose options carry how many events each would show. */
function Select({
  name,
  label,
  values,
  selected,
  counts,
  all,
  optionLabel = humanize,
}: {
  name: string;
  label: string;
  values: readonly string[];
  selected: string | null;
  counts: Map<string, number>;
  all: string;
  optionLabel?: (value: string) => string;
}) {
  // A value with nothing behind it is still offered when it is the current selection, so the form round-trips
  // instead of silently dropping the filter.
  const options = values.filter((value) => counts.has(value) || value === selected);
  return (
    <label>
      {label}
      <select name={name} defaultValue={selected ?? ""}>
        <option value="">{all}</option>
        {options.map((value) => (
          <option key={value} value={value}>{`${optionLabel(value)} (${counts.get(value) ?? 0})`}</option>
        ))}
      </select>
    </label>
  );
}

function FilterForm({ filters, facets, now }: { filters: ListingFilters; facets: FacetCounts; now: Date }) {
  const week = nextSevenDaysIst(now);
  const weekend = weekendRangeIst(now);
  const active =
    filters.area || filters.category || filters.source || filters.free || filters.from || filters.to || filters.maxPrice != null;
  return (
    <>
      <form action="/" method="get" className="filters">
        <div className="filter-row">
          <Select
            name="category"
            label="Event type"
            values={CATEGORIES}
            selected={filters.category}
            counts={facets.category}
            all="All types"
            optionLabel={categoryLabel}
          />
          <Select
            name="source"
            label="Source"
            values={[...facets.source.keys()].sort()}
            selected={filters.source}
            counts={facets.source}
            all="All sources"
          />
          <Select name="area" label="Area" values={AREAS} selected={filters.area} counts={facets.area} all="All areas" />
        </div>
        <div className="filter-row">
          <label>
            From <input type="date" name="from" defaultValue={filters.from ?? ""} />
          </label>
          <label>
            To <input type="date" name="to" defaultValue={filters.to ?? ""} />
          </label>
          <label>
            Under ₹
            <input
              type="number"
              name="max_price"
              min={0}
              step={50}
              inputMode="numeric"
              defaultValue={filters.maxPrice != null ? String(filters.maxPrice) : ""}
            />
          </label>
          <label className="check">
            <input name="free" type="checkbox" value="true" defaultChecked={filters.free} /> Free only
          </label>
        </div>
        <div className="filter-row actions">
          <button type="submit" className="button primary">
            Apply
          </button>
          {active ? (
            <a className="link" href="/">
              Clear filters
            </a>
          ) : null}
          <span className="meta">{`${facets.total} event${facets.total === 1 ? "" : "s"} in this window`}</span>
        </div>
      </form>
      <nav className="quick" aria-label="Quick date filters">
        <a className="pill" href="/today">
          Today
        </a>
        <a className="pill" href="/tonight">
          Tonight
        </a>
        <a className="pill" href="/this-weekend">
          This weekend
        </a>
        <a className="pill" href={`/?from=${week.from}&to=${week.to}`}>
          Next 7 days
        </a>
        <a className="pill" href="/free">
          Free
        </a>
        <span className="meta">{`Weekend covers ${weekend.from} to ${weekend.to}.`}</span>
      </nav>
    </>
  );
}

/** One event: its title as the link, then date, time-of-day, price, venue and category, each in its own quiet style. */
function Card({ row, moreDates }: ListingEntry) {
  const when = row.timeKind === "date-only" ? formatIstDate(row.startsAt) : formatIst(row.startsAt);
  const price = row.isFree ? "Free" : row.priceMin != null ? `₹${row.priceMin}` : "";
  const runs = moreDates > 0 ? ` · +${moreDates} more date${moreDates === 1 ? "" : "s"}` : "";
  return (
    <article className="card">
      <h2>
        <a href={`/e/${row.publicId}`}>{row.title}</a>
      </h2>
      <p className="meta">
        <span className="m-date">{when}</span>
        {row.venueName ? <> · {row.venueName}</> : null}
        {price ? (
          <>
            {" "}
            · <span className="m-price">{price}</span>
          </>
        ) : null}
        {runs}
        {" · "}
        <CategoryTag category={row.category} />
      </p>
    </article>
  );
}

/** The listing and the programmatic pages (area, category, today, weekend, venue): the same page with a different heading. */
export function Listing({
  entries,
  filters,
  facets,
  now,
  heading,
  lede,
}: {
  entries: ListingEntry[];
  filters: ListingFilters;
  facets: FacetCounts;
  now: Date;
  heading: string;
  lede: string;
}) {
  const shared = { category: filters.category, area: filters.area, free: filters.free };
  return (
    <>
      <Header view={{ current: "list", list: listHref(shared), map: mapHref(shared) }} />
      <h1>{heading}</h1>
      <p className="lede">{lede}</p>
      <FilterForm filters={filters} facets={facets} now={now} />
      <section className="listing">
        {entries.length ? (
          entries.map((entry) => <Card key={entry.row.id} {...entry} />)
        ) : (
          <p className="empty">No events match these filters in the next seven days.</p>
        )}
      </section>
    </>
  );
}
