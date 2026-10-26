import { formatIst } from "../../../utils/time";

export const istTime = (iso: string | null | undefined): string => (iso ? formatIst(iso) : "-");

/** "3m 12s" between two ISO instants; an unfinished run counts up to `now`. */
export function duration(startIso: string, endIso: string | null, now = Date.now()): string {
  const seconds = Math.max(0, Math.round(((endIso ? Date.parse(endIso) : now) - Date.parse(startIso)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export const percent = (part: number, whole: number): string => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-");

export const price = (event: { isFree: boolean; priceMin: number | null }): string =>
  event.isFree ? "Free" : event.priceMin === null ? "-" : `₹${event.priceMin}`;
