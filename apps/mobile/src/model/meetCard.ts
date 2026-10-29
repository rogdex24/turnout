import type { GroupMember } from "@turnout/contract/app/groups";
import { type Point, walkTo } from "./walk";

const MINUTE = 60_000;
const IST_OFFSET_MS = 330 * MINUTE;
const CHECK_IN_OPENS_BEFORE_MS = 90 * MINUTE;

export interface Clock {
  /** "6:00": the digits the meet card sets in the big face. */
  digits: string;
  /** "PM". */
  period: "AM" | "PM";
  /** "6:00 PM", for sentences. */
  text: string;
}

/** A moment as a Hyderabad wall clock (IST, no daylight saving). Null when the text is not a time. */
export function istClock(iso: string): Clock | null {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const local = new Date(at + IST_OFFSET_MS);
  const hours = local.getUTCHours();
  const minutes = local.getUTCMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  const digits = `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")}`;
  return { digits, period, text: `${digits} ${period}` };
}

/** Whole minutes from `now` to `iso`, rounded up so "In 1 min" holds until the minute is over. Negative once it has passed. */
export function minutesUntil(iso: string, now: number): number | null {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : Math.ceil((at - now) / MINUTE);
}

/** How far away the meet time is, in the words under the big time. Null once the time has come. */
export function countdownText(meetAt: string, now: number): string | null {
  const minutes = minutesUntil(meetAt, now);
  if (minutes === null || minutes <= 0) return null;
  if (minutes < 60) return `In ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `In ${hours} h` : `In ${hours} h ${rest} min`;
}

export type HereButton = { state: "early"; opensAt: string } | { state: "open" } | { state: "closed" };

/** "I'm here" is off until T-90m, on until T+60m, and off again after. */
export function hereButton(startsAt: string, now: number, isOpen: boolean): HereButton {
  const start = Date.parse(startsAt);
  if (isOpen) return { state: "open" };
  if (!Number.isNaN(start) && now < start - CHECK_IN_OPENS_BEFORE_MS) {
    return { state: "early", opensAt: istClock(new Date(start - CHECK_IN_OPENS_BEFORE_MS).toISOString())?.text ?? "" };
  }
  return { state: "closed" };
}

/** The status line under "Your group": how many have checked in, or null while nobody has. */
export function hereCount(members: readonly Pick<GroupMember, "checkedIn">[]): { here: number; of: number } | null {
  const here = members.filter((member) => member.checkedIn).length;
  return here === 0 ? null : { here, of: members.length };
}

export type PermissionState = "unknown" | "undetermined" | "granted" | "denied";

export type LocationLine =
  | { kind: "hidden" }
  /** Ask, or (when the system will not ask again) point to Settings. */
  | { kind: "ask"; canAsk: boolean }
  | { kind: "finding" }
  | { kind: "at_cafe" }
  | { kind: "walk"; minutes: number };

export interface LocationLineInput {
  /** The show has not started: after that the line has nothing to say. */
  beforeStart: boolean;
  permission: PermissionState;
  canAskAgain: boolean;
  point: Point | null;
  cafe: Point | null;
}

/** What the line under "Open in Maps" says. It is worked out here, on the phone, from a position that is never sent anywhere. */
export function locationLine({ beforeStart, permission, canAskAgain, point, cafe }: LocationLineInput): LocationLine {
  if (!beforeStart || permission === "unknown" || cafe === null) return { kind: "hidden" };
  if (permission === "granted") {
    if (point === null) return { kind: "finding" };
    const walk = walkTo(point, cafe);
    return walk.kind === "at_cafe" ? { kind: "at_cafe" } : { kind: "walk", minutes: walk.minutes };
  }
  return { kind: "ask", canAsk: permission === "undetermined" || canAskAgain };
}

/** Minutes on foot from the cafe to the venue, for "6 min walk to <venue>". Null when either is not placed. */
export function venueWalkMinutes(cafe: Point | null, venue: Point | null): number | null {
  if (cafe === null || venue === null) return null;
  const walk = walkTo(cafe, venue);
  return walk.kind === "at_cafe" ? 1 : walk.minutes;
}

/** A geo link that opens the person's maps app on the cafe pin, with its name as the label. */
export function mapsUrl(cafe: Point, label: string): string {
  return `geo:${cafe.lat},${cafe.lng}?q=${cafe.lat},${cafe.lng}(${encodeURIComponent(label)})`;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** The smallest view, about 450 m across, so a cafe next to the venue does not zoom to the pavement. */
const MIN_SPAN = 0.004;

/** The map window that holds the cafe and the venue with room around both. Just the cafe when the venue has no pin. */
export function mapRegion(cafe: Point, venue: Point | null): MapRegion {
  const points = venue ? [cafe, venue] : [cafe];
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  return {
    latitude: (south + north) / 2,
    longitude: (west + east) / 2,
    latitudeDelta: Math.max(MIN_SPAN, (north - south) * 2.2),
    longitudeDelta: Math.max(MIN_SPAN, (east - west) * 2.2),
  };
}
