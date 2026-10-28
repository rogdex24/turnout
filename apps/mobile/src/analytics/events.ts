import { scrubText } from "./scrub";

/**
 * Every analytics event the app may send, with its properties. Nothing else is captured: no autocapture, no screen text, no
 * recordings. A property here is an id of a show or a plan, a count or a flag, never a place, a handle or a person.
 */
export interface EventProps {
  app_opened: Record<string, never>;
  show_viewed: { show_id: string };
  buy_tapped: { show_id: string };
  go_tapped: { show_id: string; groups_enabled: boolean };
  im_here_tapped: { plan_id: string };
}

export type EventName = keyof EventProps;

/** The property names each event may carry. `safeProps` sends only these. */
export const EVENT_KEYS: { [N in EventName]: readonly (keyof EventProps[N] & string)[] } = {
  app_opened: [],
  show_viewed: ["show_id"],
  buy_tapped: ["show_id"],
  go_tapped: ["show_id", "groups_enabled"],
  im_here_tapped: ["plan_id"],
};

/** Words that mark a property as a place, a handle or a person. A key is split into words at `_`, `-`, `.` and capitals, then checked. */
const FORBIDDEN_WORDS = new Set([
  "location",
  "lat",
  "lng",
  "lon",
  "latitude",
  "longitude",
  "geo",
  "gps",
  "coords",
  "coordinates",
  "address",
  "area",
  "city",
  "handle",
  "username",
  "user",
  "userid",
  "person",
  "personid",
  "distinct",
  "distinctid",
  "phone",
  "email",
  "name",
]);

function words(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The first property name (with its path, for a nested object) that looks like a place, a handle or a person, or null. */
export function forbiddenKey(props: Record<string, unknown>, path = ""): string | null {
  for (const [key, value] of Object.entries(props)) {
    const here = path === "" ? key : `${path}.${key}`;
    if (words(key).some((word) => FORBIDDEN_WORDS.has(word))) return here;
    if (typeof value === "object" && value !== null) {
      const inner = forbiddenKey(value as Record<string, unknown>, here);
      if (inner !== null) return inner;
    }
  }
  return null;
}

export type SafeProps = Record<string, string | number | boolean>;

/** The properties to send: only the declared ones, strings scrubbed. Null when a forbidden key is present, so the whole event is dropped. */
export function safeProps<N extends EventName>(name: N, props: EventProps[N]): SafeProps | null {
  if (forbiddenKey(props) !== null) return null;
  const out: SafeProps = {};
  for (const key of EVENT_KEYS[name]) {
    const value: unknown = props[key as keyof typeof props];
    if (typeof value === "string") out[key] = scrubText(value);
    else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}
