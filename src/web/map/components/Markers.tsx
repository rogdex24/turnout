import { MapPin } from "lucide-react";
import { isCategory } from "../../../catalog/category.js";
import { LAYOUT } from "../layout.js";
import { humanize, plural } from "../model/format.js";
import type { MapFeature } from "../types.js";
import { CategoryIcon } from "./CategoryIcon.js";
import { Icon } from "./Icon.js";

/**
 * One tile per venue. Events arrive sorted by start, so events[0] is the venue's next event: it sets the icon,
 * tint, label and accessible name. Because React updates the tile in place, a changed next event changes the label.
 */
export function VenueMarker({
  feature,
  selected,
  onSelect,
}: {
  feature: MapFeature;
  selected: boolean;
  onSelect: (venueId: string) => void;
}) {
  const { name, events, venueId } = feature.properties;
  const n = events.length;
  const next = events[0]!;
  const tint = isCategory(next.category) ? next.category : "other";
  const style = { "--tint": `var(--tint-${tint})` } as React.CSSProperties;
  return (
    <button
      type="button"
      className={selected ? "tile sel" : "tile"}
      style={style}
      aria-label={`${next.title} at ${name}, ${humanize(next.category)}, ${plural(n, "event")}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(venueId);
      }}
    >
      <CategoryIcon category={next.category} size={LAYOUT.categoryIcon.tile} />
      {n > 1 ? <span className="badge">{n}</span> : null}
      <span className="label">
        <span className="lt">{next.title}</span>
        <span className="lv">{name}</span>
      </span>
    </button>
  );
}

/** Up to three stacked tiles, "+N" for venues beyond the first, and a caption counting events. */
export function ClusterMarker({ venues, events, onOpen }: { venues: number; events: number; onOpen: () => void }) {
  const stack = Math.min(venues, LAYOUT.stackMax);
  return (
    <button
      type="button"
      className="cluster"
      aria-label={`${plural(events, "event")} at ${plural(venues, "venue")}, zoom in`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <span className="stack">
        {Array.from({ length: stack }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed-length decorative stack, position is its only identity
          <span key={i} className="tile ghost" style={{ "--i": stack - 1 - i } as React.CSSProperties}>
            {i === stack - 1 ? <Icon as={MapPin} size={LAYOUT.tileGlyph} /> : null}
          </span>
        ))}
      </span>
      {venues > 1 ? <span className="badge">+{venues - 1}</span> : null}
      <span className="label caption">{plural(events, "event")}</span>
    </button>
  );
}

/** Where you are, while Near me is on. It takes no clicks, so the tile under it still opens. */
export function LocationDot() {
  return <div className="me" role="img" aria-label="Your location" />;
}
