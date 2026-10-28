import { formatShowDay, formatShowShort, formatShowTime, formatShowWhen } from "./showTime";

/** The server sends instants in UTC. People here read Indian time (UTC+5:30, no daylight saving), whatever zone the phone is in. */
const IST_OFFSET_MS = 330 * 60_000;

/** The instant as `YYYY-MM-DDTHH:mm` on the Indian clock, the shape the `formatShow*` functions read. Null for a value that is not a time. */
export function toIstLocal(instant: string): string | null {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 16);
}

function through(instant: string, format: (local: string) => string | null): string {
  const local = toIstLocal(instant);
  return local === null ? "" : (format(local) ?? "");
}

/** "Sat 31 Oct, 7:00 PM" */
export const istWhen = (instant: string): string => through(instant, formatShowWhen);
/** "Sat 31 Oct" */
export const istDay = (instant: string): string => through(instant, formatShowDay);
/** "7:00 PM" */
export const istTime = (instant: string): string => through(instant, formatShowTime);
/** "Fri 7:00 PM", for a moment within the week. */
export const istShort = (instant: string): string => through(instant, formatShowShort);

/** From the reveal on, the group's names, photos and cafe are the server's to send. Before it, the app shows a count and nothing else. */
export function isRevealed(now: Date, revealAt: string): boolean {
  const reveal = Date.parse(revealAt);
  return !Number.isNaN(reveal) && now.getTime() >= reveal;
}

/** Whether a moment has passed. An unreadable one counts as not passed. */
export function hasPassed(now: Date, instant: string): boolean {
  const ms = Date.parse(instant);
  return !Number.isNaN(ms) && now.getTime() >= ms;
}
