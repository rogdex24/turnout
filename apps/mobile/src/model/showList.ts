import type { ApiEvent } from "@turnout/contract/events";
import { parseLocal } from "./showTime";

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;

/** Today's calendar date in India as `YYYY-MM-DD`, whatever zone the phone is set to. */
export function istDate(now: number): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export interface DayGroup {
  /** `YYYY-MM-DD`, as written in `starts_at_local`. */
  date: string;
  relative: "today" | "tomorrow" | null;
  shows: ApiEvent[];
}

/** Groups shows by the day the server wrote, soonest first. A show whose time cannot be read is left out, not guessed. */
export function dayGroups(shows: readonly ApiEvent[], now: number): DayGroup[] {
  const today = istDate(now);
  const tomorrow = istDate(now + DAY_MS);
  const readable = shows.filter((show) => parseLocal(show.starts_at_local) !== null);
  const sorted = [...readable].sort((a, b) => (a.starts_at_local < b.starts_at_local ? -1 : a.starts_at_local > b.starts_at_local ? 1 : 0));
  const groups: DayGroup[] = [];
  for (const show of sorted) {
    const date = show.starts_at_local.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last?.date === date) {
      last.shows.push(show);
    } else {
      groups.push({ date, relative: date === today ? "today" : date === tomorrow ? "tomorrow" : null, shows: [show] });
    }
  }
  return groups;
}

export type ListItem =
  | { kind: "day"; key: string; date: string; relative: DayGroup["relative"]; count: number }
  | { kind: "featured"; key: string; show: ApiEvent }
  | { kind: "tiles"; key: string; shows: [ApiEvent] | [ApiEvent, ApiEvent] };

/** The flat rows of the list: a day label, the one featured ticket card (the soonest show), then tiles two to a row. */
export function listItems(groups: readonly DayGroup[]): ListItem[] {
  const items: ListItem[] = [];
  let featured = false;
  for (const group of groups) {
    items.push({ kind: "day", key: `day-${group.date}`, date: group.date, relative: group.relative, count: group.shows.length });
    let rest = group.shows;
    const first = group.shows[0];
    if (!featured && first) {
      featured = true;
      items.push({ kind: "featured", key: `featured-${first.id}`, show: first });
      rest = group.shows.slice(1);
    }
    for (let i = 0; i < rest.length; i += 2) {
      const a = rest[i] as ApiEvent;
      const b = rest[i + 1];
      items.push({ kind: "tiles", key: `tiles-${a.id}`, shows: b ? [a, b] : [a] });
    }
  }
  return items;
}

/** The shows of every loaded page in order, without a repeat if the catalogue moved between two pages. */
export function mergePages(pages: readonly { events: readonly ApiEvent[] }[]): ApiEvent[] {
  const seen = new Set<string>();
  const merged: ApiEvent[] = [];
  for (const page of pages) {
    for (const event of page.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      merged.push(event);
    }
  }
  return merged;
}

/** "hitec-city" as "Hitec City", the way the server labels it in the areas list. */
export function areaLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => (word ? word[0]?.toUpperCase() + word.slice(1) : word))
    .join(" ");
}
