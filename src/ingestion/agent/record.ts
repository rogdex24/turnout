import { istLocalToIso } from "../../utils/time.js";
import { asRecord, isSourceUrl, readNumber, readString } from "../sources/shared.js";

export interface AgentRecord {
  title: string;
  starts_local: string;
  ends_local: string | null;
  venue_name: string | null;
  address: string | null;
  price_min: number | null;
  is_free: boolean;
  category_hint: string | null;
  source_url: string;
  evidence: { title: string; date: string; venue: string | null; price: string | null };
}

/** starts_local is "YYYY-MM-DDTHH:MM" (timed) or "YYYY-MM-DD" (date-only, stored as IST midnight). */
export function parseStartsLocal(local: string): { iso: string; timeKind: "timed" | "date-only" } | null {
  const timeKind = /^\d{4}-\d{2}-\d{2}$/.test(local) ? "date-only" : "timed";
  const iso = istLocalToIso(timeKind === "date-only" ? `${local}T00:00` : local);
  return iso ? { iso, timeKind } : null;
}

export interface Rejection {
  reason: string;
}

/** Checks shape and types only. Whether the claims are true is verify.ts's job. */
export function parseAgentRecord(value: unknown): AgentRecord | Rejection {
  const raw = asRecord(value);
  if (!raw) return { reason: "not a JSON object" };
  const evidence = asRecord(raw.evidence);
  if (!evidence) return { reason: "missing evidence object" };

  const title = readString(raw.title);
  if (!title) return { reason: "missing title" };
  const startsLocal = readString(raw.starts_local);
  const start = startsLocal ? parseStartsLocal(startsLocal) : null;
  if (!startsLocal || !start) return { reason: "starts_local is not YYYY-MM-DDTHH:MM or YYYY-MM-DD" };
  const endsLocal = nullableString(raw.ends_local);
  if (endsLocal === undefined || (endsLocal !== null && (start.timeKind === "date-only" || !istLocalToIso(endsLocal)))) {
    return { reason: "ends_local must be null, or YYYY-MM-DDTHH:MM on a timed record" };
  }
  const venueName = nullableString(raw.venue_name);
  const address = nullableString(raw.address);
  const categoryHint = nullableString(raw.category_hint);
  if (venueName === undefined || address === undefined || categoryHint === undefined) {
    return { reason: "venue_name, address and category_hint must be a string or null" };
  }
  const priceMin = raw.price_min === null ? null : readNumber(raw.price_min);
  if (raw.price_min !== null && (typeof raw.price_min !== "number" || priceMin === null || priceMin < 0)) {
    return { reason: "price_min must be a non-negative number or null" };
  }
  if (typeof raw.is_free !== "boolean") return { reason: "is_free must be a boolean" };

  const sourceUrl = readString(raw.source_url);
  if (!sourceUrl || !isSourceUrl(sourceUrl)) {
    return { reason: "source_url is not an http(s) URL" };
  }

  const quoteTitle = readString(evidence.title);
  const quoteDate = readString(evidence.date);
  const quoteVenue = nullableString(evidence.venue);
  const quotePrice = nullableString(evidence.price);
  if (!quoteTitle) return { reason: "missing evidence.title" };
  if (!quoteDate) return { reason: "missing evidence.date" };
  if (quoteVenue === undefined || quotePrice === undefined) return { reason: "evidence.venue and evidence.price must be a string or null" };
  if (venueName && !quoteVenue) return { reason: "venue_name given without evidence.venue" };
  if ((priceMin !== null || raw.is_free) && !quotePrice) return { reason: "price or is_free given without evidence.price" };

  return {
    title,
    starts_local: startsLocal,
    ends_local: endsLocal,
    venue_name: venueName,
    address,
    price_min: priceMin,
    is_free: raw.is_free,
    category_hint: categoryHint,
    source_url: sourceUrl,
    evidence: { title: quoteTitle, date: quoteDate, venue: quoteVenue, price: quotePrice },
  };
}

export function isRejection(value: AgentRecord | Rejection): value is Rejection {
  return "reason" in value;
}

/** undefined means present but the wrong type; null means absent or null. */
function nullableString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? readString(value) : undefined;
}
