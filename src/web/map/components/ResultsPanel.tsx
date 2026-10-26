import { Accordion } from "@web/ui/components/accordion";
import { DEFAULT_FILTERS, GROUP_VALUES, type GroupBy, type MapFilters, type Ranked } from "../model/filters.js";
import { plural } from "../model/format.js";
import { groupEvents } from "../model/group.js";
import { at, type Selection } from "../model/selection.js";
import type { MapCollection } from "../types.js";
import { NavLink } from "./nav.js";
import { GroupSection, VenueSection } from "./ResultsSection.js";

const GROUP_LABEL: Record<GroupBy, string> = { type: "Type", day: "Day", venue: "Venue" };

/** "Group by Type · Day · Venue": a group of links, so it works without JavaScript and lives in the URL. */
function GroupSwitch({ filters }: { filters: MapFilters }) {
  return (
    <nav className="group-by inset" aria-label="Group events by">
      <span className="muted">Group by</span>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset brings a UA border, padding and min-inline-size that would change the layout; role=group is the same semantics */}
      <div className="segs" role="group" aria-label="Group by">
        {GROUP_VALUES.map((g) => (
          <NavLink key={g} className="seg" to={at({ ...filters, group: g })} aria-current={filters.group === g ? "true" : undefined}>
            {GROUP_LABEL[g]}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** The map is zoomed to a place with no events, but some match elsewhere. */
export function EmptyArea({ elsewhere, onShowAll }: { elsewhere: number; onShowAll: () => void }) {
  return (
    <>
      <h2 className="vh inset">No events in this area</h2>
      <p className="meta lede inset">{`${plural(elsewhere, "event")} match elsewhere on the map.`}</p>
      <div className="inset">
        <button type="button" className="button primary" onClick={onShowAll}>
          Show all
        </button>
      </div>
    </>
  );
}

export function EmptyState() {
  return (
    <>
      <h2 className="vh inset">No events match</h2>
      <p className="meta lede inset">Nothing here fits these filters.</p>
      <div className="inset">
        <NavLink className="button primary" to={at(DEFAULT_FILTERS)}>
          Clear filters
        </NavLink>
      </div>
    </>
  );
}

/**
 * The list: heading with its count, the group switch, then sections in an Accordion that allows several open at once.
 * Which sections are open lives in the session reducer (`collapsed`), so a map move that redraws the list keeps them.
 */
export function ResultsPanel({
  ranked,
  filters,
  selection,
  organisers,
  collapsed,
  inView,
  unplaced,
  onSection,
}: {
  ranked: Ranked[];
  filters: MapFilters;
  selection: Selection;
  organisers: MapCollection["organisers"];
  collapsed: readonly string[];
  /** True once the map reported a viewport: the list then shows only what is in it. */
  inView: boolean;
  /** Events whose venue has no known location: on a phone the sheet heading says so, since the floating count is hidden there. */
  unplaced: number;
  onSection: (key: string, open: boolean) => void;
}) {
  if (!ranked.length) return <EmptyState />;
  const events = ranked.reduce((sum, r) => sum + r.feature.properties.events.length, 0);

  const sections =
    filters.group === "venue"
      ? ranked.map((r) => ({
          key: `venue:${r.feature.properties.venueId}`,
          node: (
            <VenueSection key={r.feature.properties.venueId} ranked={r} filters={filters} selection={selection} organisers={organisers} />
          ),
        }))
      : groupEvents(ranked, filters.group).map((g) => ({
          key: `${filters.group}:${g.key}`,
          node: (
            <GroupSection
              key={g.key}
              group={g}
              by={filters.group as "type" | "day"}
              filters={filters}
              selection={selection}
              organisers={organisers}
            />
          ),
        }));
  const open = sections.map((s) => s.key).filter((k) => !collapsed.includes(k));

  return (
    <>
      <h2 className="vh inset">
        {plural(events, "event")}
        {inView ? " in view" : ""}
        {unplaced ? (
          <span className="unplaced" title="Events whose venue has no known location are not on the map.">
            {" "}
            +{unplaced} unplaced
          </span>
        ) : null}
      </h2>
      <GroupSwitch filters={filters} />
      <Accordion
        multiple
        value={open}
        onValueChange={(next: string[]) => {
          for (const key of open) if (!next.includes(key)) onSection(key, false);
          for (const key of next) if (!open.includes(key)) onSection(key, true);
        }}
      >
        {sections.map((s) => s.node)}
      </Accordion>
    </>
  );
}
