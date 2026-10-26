import { Search, SlidersHorizontal, X } from "lucide-react";
import { type FormEvent, lazy, Suspense, useContext, useEffect, useRef, useState } from "react";
import { categoryLabel } from "../../../catalog/category.js";
import { LAYOUT } from "../layout.js";
import { DEFAULT_FILTERS, type MapFilters, type When } from "../model/filters.js";
import { humanize, radiusLabel } from "../model/format.js";
import { at } from "../model/selection.js";
import { filtersFromForm } from "../model/url.js";
import { Icon } from "./Icon.js";
import { NavContext, NavLink } from "./nav.js";

// Rarely used, so each is its own chunk, fetched on first use: the Filters popover (Popover and Combobox) on the first
// open or hover, and the distance slider the first time Near me is on.
const loadPopover = () => import("./FiltersPopover.js");
const FiltersPopover = lazy(loadPopover);
const DistanceSlider = lazy(() => import("./DistanceSlider.js"));

export interface FilterBarProps {
  filters: MapFilters;
  categories: string[];
  areas: string[];
  /** The Near me radius while it is on (the button itself is in the control column). */
  near: { km: number | null };
  filtersOpen: boolean;
  /** The popover opened because location was refused, so focus goes to Area. */
  focusArea?: boolean;
  onFiltersOpen: (open: boolean) => void;
  onRadius: (km: number) => void;
  onRadiusCommit: () => void;
}

const PRESETS: Array<{ when: When; label: string }> = [
  { when: "tonight", label: "Tonight" },
  { when: "weekend", label: "This weekend" },
  { when: "week", label: "Next 7 days" },
];

const hidden = (name: string, value: string | boolean | null) =>
  value ? <input type="hidden" name={name} value={value === true ? "1" : value} /> : null;

/** The filters a form has to carry along so submitting it changes only what it edits. */
function Keep({ filters }: { filters: MapFilters }) {
  return (
    <>
      {hidden("when", filters.when === "week" ? null : filters.when)}
      {hidden("free", filters.free)}
      {hidden("group", filters.group === "type" ? null : filters.group)}
    </>
  );
}

/**
 * The search pill, top left. Its text is a draft: it is not in the URL until the form is submitted, and submitting keeps
 * the other filters and the grouping. A GET form, so it works without JavaScript.
 */
export function SearchBox({ filters }: { filters: MapFilters }) {
  const nav = useContext(NavContext);
  const [draft, setDraft] = useState(filters.q);
  useEffect(() => setDraft(filters.q), [filters.q]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    nav.go(at(filtersFromForm(event.currentTarget)));
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: test/mapPage.test.ts pins this exact form markup, and <search> would add a wrapper
    <form className="pill search" role="search" action="/map" method="get" onSubmit={submit}>
      <span className="lead" aria-hidden="true">
        <Icon as={Search} size={LAYOUT.searchIcon} />
      </span>
      <input
        type="search"
        name="q"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search events"
        aria-label="Search events"
        autoComplete="off"
      />
      {filters.q ? (
        <NavLink className="clear" to={at({ ...filters, q: "" })} aria-label="Clear search">
          <Icon as={X} />
        </NavLink>
      ) : null}
      <Keep filters={filters} />
      {hidden("category", filters.category)}
      {hidden("area", filters.area)}
    </form>
  );
}

/**
 * The filter row: the when presets, Free, the Filters popover and (while Near me is on) the distance slider.
 * Every control is a link or a form that works without JavaScript; the client upgrades them to state changes.
 */
export function FilterBar({
  filters,
  categories,
  areas,
  near,
  filtersOpen,
  focusArea,
  onFiltersOpen,
  onRadius,
  onRadiusCommit,
}: FilterBarProps) {
  const nav = useContext(NavContext);
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);
  const [wantPopover, setWantPopover] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  const filtersOn = !!(filters.category || filters.area);
  const keep = <Keep filters={filters} />;
  const to = (next: Partial<MapFilters>) => at({ ...filters, ...next });

  // The slider shows the dragged value at once; the results follow once per frame.
  const [shown, setShown] = useState(near.km ?? LAYOUT.nearKm.default);
  useEffect(() => {
    if (near.km != null) setShown(near.km);
  }, [near.km]);
  const frame = useRef(0);
  const pending = useRef<number | null>(null);
  const flush = () => {
    cancelAnimationFrame(frame.current);
    if (pending.current != null) onRadius(pending.current);
    pending.current = null;
  };
  const onSlide = (km: number) => {
    setShown(km);
    pending.current = km;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(flush);
  };
  const commit = () => {
    flush();
    onRadiusCommit();
  };

  return (
    <>
      {/* Links in a group: each is a real link (works without JavaScript) and the one that is on carries aria-current. */}
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset brings a UA border, padding and min-inline-size that would change the layout; role=group is the same semantics */}
      <div className="presets" role="group" aria-label="When">
        {PRESETS.map(({ when, label }) => {
          const on = filters.when === when;
          // Pressing the one that is on goes back to the default window.
          return (
            <NavLink
              key={when}
              className="pill"
              to={to({ when: on && when !== "week" ? "week" : when })}
              aria-current={on ? "true" : undefined}
            >
              {label}
            </NavLink>
          );
        })}
      </div>
      <NavLink className="pill" to={to({ free: !filters.free })} aria-current={filters.free ? "true" : undefined}>
        Free
      </NavLink>
      {enhanced ? (
        <>
          <button
            ref={anchor}
            type="button"
            className={filtersOn || filtersOpen ? "pill filters on" : "pill filters"}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            onPointerEnter={() => void loadPopover()}
            onFocus={() => void loadPopover()}
            onClick={() => {
              setWantPopover(true);
              onFiltersOpen(!filtersOpen);
            }}
          >
            <Icon as={SlidersHorizontal} />
            Filters{filtersOn ? " ·" : ""}
          </button>
          {wantPopover || filtersOpen ? (
            <Suspense fallback={null}>
              <FiltersPopover
                filters={filters}
                categories={categories}
                areas={areas}
                open={filtersOpen}
                focusArea={focusArea}
                onOpenChange={onFiltersOpen}
                anchor={anchor}
                onApply={(next) => nav.go(at(next))}
              />
            </Suspense>
          ) : null}
        </>
      ) : (
        // Without JavaScript the Filters pill is a native disclosure around a GET form.
        <details className={filtersOn ? "pill filters on" : "pill filters"} open={filtersOpen}>
          <summary>
            <Icon as={SlidersHorizontal} />
            Filters{filtersOn ? " ·" : ""}
          </summary>
          <form action="/map" method="get">
            <label>
              Type
              <select name="category" defaultValue={filters.category ?? ""}>
                <option value="">All types</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Area
              <select name="area" defaultValue={filters.area ?? ""}>
                <option value="">All areas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {humanize(a)}
                  </option>
                ))}
              </select>
            </label>
            {keep}
            {hidden("q", filters.q)}
            <button type="submit" className="button">
              Apply
            </button>
            <NavLink className="link" to={at({ ...DEFAULT_FILTERS, group: filters.group })}>
              Clear all
            </NavLink>
          </form>
        </details>
      )}
      {near.km == null ? null : (
        <div className="pill radius">
          <Suspense fallback={<output>{radiusLabel(shown)}</output>}>
            <DistanceSlider km={shown} onChange={onSlide} onCommit={commit} />
          </Suspense>
        </div>
      )}
    </>
  );
}
