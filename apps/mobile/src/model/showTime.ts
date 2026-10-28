/** Show times as the server writes them: `starts_at_local` is Indian time with its offset, or a bare date. Shown as written, whatever the phone's zone. */
export interface LocalTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dateOnly: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

export function parseLocal(value: string): LocalTime | null {
  const m = LOCAL.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dateOnly = m[4] === undefined;
  const [hour, minute] = dateOnly ? [0, 0] : [Number(m[4]), Number(m[5])];
  const real = new Date(Date.UTC(year, month - 1, day));
  const valid = real.getUTCMonth() === month - 1 && real.getUTCDate() === day && hour < 24 && minute < 60;
  return valid ? { year, month, day, hour, minute, dateOnly } : null;
}

/** "Sat 7 Nov" */
export function formatShowDay(value: string): string {
  const t = parseLocal(value);
  if (!t) return value;
  const weekday = WEEKDAYS[new Date(Date.UTC(t.year, t.month - 1, t.day)).getUTCDay()];
  return `${weekday} ${t.day} ${MONTHS[t.month - 1]}`;
}

/** "7:00 PM", or null for a show that only has a date. */
export function formatShowTime(value: string): string | null {
  const t = parseLocal(value);
  if (!t || t.dateOnly) return null;
  const hour12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${hour12}:${String(t.minute).padStart(2, "0")} ${t.hour < 12 ? "AM" : "PM"}`;
}

/** "Sat 7 Nov, 7:00 PM". Day and time are joined with a comma, never a middle dot. */
export function formatShowWhen(value: string): string {
  const time = formatShowTime(value);
  return time ? `${formatShowDay(value)}, ${time}` : formatShowDay(value);
}

/** "Sat 7:00 PM" for a card under a day label, or "Sat 7 Nov" for a show that only has a date. Falls back to the text as written. */
export function formatShowShort(value: string): string {
  const t = parseLocal(value);
  if (!t) return value;
  const time = formatShowTime(value);
  if (!time) return formatShowDay(value);
  return `${WEEKDAYS[new Date(Date.UTC(t.year, t.month - 1, t.day)).getUTCDay()]} ${time}`;
}

export interface PriceFields {
  is_free: boolean;
  price_min: number | null;
  price_max: number | null;
  currency: string;
}

/** Indian digit grouping: 1,25,000. */
export function groupIndian(n: number): string {
  const digits = String(Math.round(n));
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${head},${digits.slice(-3)}`;
}

/** "Free", "₹499", "₹499 to ₹1,499", or null when the source gave no price. */
export function formatPrice(p: PriceFields): string | null {
  if (p.is_free) return "Free";
  const low = p.price_min ?? p.price_max;
  if (low === null) return null;
  const high = p.price_max ?? low;
  const money = (n: number) => (p.currency === "INR" ? `₹${groupIndian(n)}` : `${p.currency} ${groupIndian(n)}`);
  return low === high ? money(low) : `${money(low)} to ${money(high)}`;
}

/** The price as a card shows it: the lowest price, and whether the show has a range ("From" goes before it). Null with no price. */
export function priceFrom(p: PriceFields): { amount: string; isRange: boolean } | null {
  if (p.is_free) return { amount: "Free", isRange: false };
  const low = p.price_min ?? p.price_max;
  if (low === null) return null;
  const high = p.price_max ?? low;
  const amount = formatPrice({ ...p, price_min: low, price_max: low });
  return amount === null ? null : { amount, isRange: high !== low };
}
