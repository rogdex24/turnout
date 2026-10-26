/** Pure text helpers for the map: dates in IST, plurals, distances, placeholder tints. Shared by the server render and the browser. */

import { LAYOUT } from "../layout.js";
import type { MapEvent, Trust } from "../types.js";

export function humanize(slug: string): string {
  return slug.replace(/[-_]/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export const kmText = (km: number): string => `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;

export const radiusLabel = (km: number): string => `Within ${km} km`;

const WHEN = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
const CLOCK = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

export const formatDate = (iso: string): string => WHEN.format(new Date(iso)).replace(",", "");
export const formatClock = (iso: string): string =>
  CLOCK.format(new Date(iso)).replace(/\s*([ap])m/i, (_, x: string) => ` ${x.toUpperCase()}M`);

/** "Sat 12 Oct · 7:00 PM", or "Sat 12 Oct" for a date-only event: DESIGN.md never prints a guessed time. */
export function formatWhen(iso: string, timeKind: "timed" | "date-only"): string {
  return [formatDate(iso), timeKind === "timed" ? formatClock(iso) : ""].filter(Boolean).join(" · ");
}

/** Deterministic 1..6 from a string, so a placeholder keeps its tint across renders. */
export function hashStep(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (Math.abs(h) % LAYOUT.placeholderSteps.length) + 1;
}

export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** The one category every event at a venue shares, or null when they differ (DESIGN.md, Event row). */
export function venueCategory(events: MapEvent[]): string | null {
  const first = events[0]?.category;
  return first && events.every((e) => e.category === first) ? first : null;
}

export const trustLine = (trust: Trust): string =>
  trust.events > 0 ? `${plural(trust.events, "event")} this month · on ${plural(trust.sources, "source")}` : "";
