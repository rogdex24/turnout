/** A point on the map. Never sent anywhere: the walk time is worked out on the phone. */
export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
/** Streets are not straight lines, so the straight distance is stretched by this much. */
const ROUTE_FACTOR = 1.3;
const WALK_KM_PER_HOUR = 4.8;
/** Within this many metres of the cafe the person is at the cafe. */
export const AT_CAFE_METRES = 75;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The straight distance over the ground between two points, in metres. */
export function haversineMetres(a: Point, b: Point): number {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type WalkState = { kind: "at_cafe" } | { kind: "walk"; minutes: number; metres: number };

/** Where the person stands against the cafe: at it, or a walk of whole minutes (never less than one) away. */
export function walkTo(from: Point, cafe: Point): WalkState {
  const straight = haversineMetres(from, cafe);
  if (straight <= AT_CAFE_METRES) return { kind: "at_cafe" };
  const metres = straight * ROUTE_FACTOR;
  const minutes = Math.max(1, Math.round(metres / ((WALK_KM_PER_HOUR * 1000) / 60)));
  return { kind: "walk", minutes, metres: Math.round(metres) };
}

/** A point only counts when both numbers are real. The server sends null for a cafe it has not placed. */
export function toPoint(lat: number | null | undefined, lng: number | null | undefined): Point | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
