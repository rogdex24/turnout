/**
 * Asia/Kolkata time helpers. Everything the site stores is ISO UTC; everything
 * it shows and filters by is Hyderabad wall clock, so every conversion between
 * the two lives here rather than being rediscovered at each call site.
 *
 * IST is a fixed +05:30 with no daylight saving, which is why the arithmetic
 * below can add a constant offset instead of consulting a timezone database.
 */

/** "sv-SE" formats as ISO, so this yields YYYY-MM-DD directly. */
const IST_YMD = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata" });

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Current calendar date in Asia/Kolkata as YYYY-MM-DD. */
export function istCalendarDate(now: Date): string {
  return IST_YMD.format(now);
}

function istParts(now: Date): { y: number; m: number; d: number; dow: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), d: ist.getUTCDate(), dow: ist.getUTCDay() };
}

/** Next Fri 00:00 IST .. Sun 23:59:59.999 IST as YYYY-MM-DD (for startOfDayIst/endOfDayIst). */
export function weekendRangeIst(now: Date): { from: string; to: string } {
  const { y, m, d, dow } = istParts(now); // dow: 0=Sun .. 5=Fri 6=Sat in IST wall clock
  // Days until Friday: if Fri/Sat/Sun stay on this weekend; else next Friday.
  let deltaToFri: number;
  if (dow === 5) deltaToFri = 0;
  else if (dow === 6) deltaToFri = -1;
  else if (dow === 0) deltaToFri = -2;
  else deltaToFri = 5 - dow;
  const fri = new Date(Date.UTC(y, m, d + deltaToFri));
  const sun = new Date(Date.UTC(fri.getUTCFullYear(), fri.getUTCMonth(), fri.getUTCDate() + 2));
  return { from: fri.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}

/** Today through today + 6 as YYYY-MM-DD: seven IST calendar days. */
export function nextSevenDaysIst(now: Date): { from: string; to: string } {
  const { y, m, d } = istParts(now);
  return { from: new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10), to: new Date(Date.UTC(y, m, d + 6)).toISOString().slice(0, 10) };
}

/** Tonight: today 17:00 IST .. end of today IST. */
export function tonightBoundsIst(now: Date): { fromIso: string; toIso: string } {
  const day = istCalendarDate(now);
  return { fromIso: new Date(`${day}T17:00:00+05:30`).toISOString(), toIso: endOfDayIst(day) };
}

export function startOfDayIst(date: string): string {
  return new Date(`${date}T00:00:00+05:30`).toISOString();
}

export function endOfDayIst(date: string): string {
  return new Date(`${date}T23:59:59.999+05:30`).toISOString();
}

/** The same instant written with an explicit +05:30 offset, for ICS local times. */
export function toIstOffset(iso: string): string {
  const ist = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}` +
    `T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}+05:30`
  );
}

const IST_WHEN = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * Human-facing date for a listing card, e.g. "Sat, 12 Sep, 7:00 PM". Built from the parts, because the
 * joining literal (", " or " at ") differs between ICU versions and so between machines.
 */
export function formatIst(iso: string): string {
  const part = Object.fromEntries(IST_WHEN.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${part.weekday}, ${part.day} ${part.month}, ${part.hour}:${part.minute} ${(part.dayPeriod ?? "").toUpperCase()}`;
}

/** "2026-10-18T19:30" read as Hyderabad wall clock, to ISO UTC. Null when it is not a real date. */
export function istLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const ms = Date.parse(`${local}:00+05:30`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Human-facing date when the source has not advertised a clock time. */
export function formatIstDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(
    new Date(iso),
  );
}
