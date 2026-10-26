import type { MapEvent, MapFeature } from "../types.js";
import type { Ranked } from "./filters.js";

export interface ListItem {
  event: MapEvent;
  feature: MapFeature;
  km: number | null;
}

export interface EventGroup {
  /** A category slug for type, an IST date (YYYY-MM-DD) for day. */
  key: string;
  items: ListItem[];
}

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Events from ranked venues regrouped by type or by IST day (DESIGN.md, Panel list). Days run in
 * date order; types run largest first, with the catch-all "other" always last. Inside a group, nearest first when distances are known, else soonest.
 */
export function groupEvents(ranked: Ranked[], by: "type" | "day"): EventGroup[] {
  const groups = new Map<string, ListItem[]>();
  for (const { feature, km } of ranked) {
    for (const event of feature.properties.events) {
      const key = by === "type" ? event.category : IST_DAY.format(new Date(event.startsAt));
      const item = { event, feature, km };
      const group = groups.get(key);
      if (group) group.push(item);
      else groups.set(key, [item]);
    }
  }
  const order = (a: ListItem, b: ListItem) =>
    (a.km != null && b.km != null ? a.km - b.km : 0) || a.event.startsAt.localeCompare(b.event.startsAt);
  const list = [...groups].map(([key, items]) => ({ key, items: items.sort(order) }));
  const last = (g: EventGroup) => (g.key === "other" ? 1 : 0);
  return list.sort((a, b) =>
    by === "day" ? a.key.localeCompare(b.key) : last(a) - last(b) || b.items.length - a.items.length || a.key.localeCompare(b.key),
  );
}
