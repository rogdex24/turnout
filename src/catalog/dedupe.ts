import { istCalendarDate } from "../utils/time.js";
import { hasRealVenue, sourceTrustTier } from "./listability.js";
import type { EventRow } from "./types.js";

// data-model.md 8.2's "venue-name fallback" match rule (Phase 1 has no
// resolved venue_id yet, so this is the applicable strong-match rule):
// same-ish venue name, starts_at within 90 minutes, similar title.
const DEFAULT_TITLE_THRESHOLD = 0.82;
// Two sources rarely name a venue identically. 0.80 accepts "Novotel HICC"
// against "Novotel Hyderabad Convention Centre" (0.828), which the old 0.85
// rejected, while still rejecting genuinely different venues (Lamakaan against
// Roastery Coffee House scores 0.391).
const VENUE_NAME_THRESHOLD = 0.8;
const MATCH_WINDOW_MS = 90 * 60 * 1000;
// A venue selling many different things at one time slot (seen live: a craft
// cafe running ~9 differently-themed workshops back to back) makes a handful
// of its titles cross the plain title threshold on shared boilerplate words
// alone ("... Art Date", "... Painting") — coincidence becomes likely once
// enough short, same-template candidates are competing for a match. Once a
// venue+time slot has more than this many candidates, require a
// near-exact title instead of just a similar one.
const BUSY_CLUSTER_NEIGHBOR_COUNT = 3;
const BUSY_CLUSTER_TITLE_THRESHOLD = 0.95;

// data-model.md 8.1: strip promoter framing and a trailing city tag before any
// similarity comparison. Real Tier A data (district.in, allevents.in) both
// suffix nearly every title with "- Hyderabad" or "| Hyderabad", which is
// otherwise enough shared text to push unrelated titles over the match
// threshold on its own (seen live: a venue's whole workshop menu, "Gold Foil
// Art Date - Hyderabad" next to "Fluid Art Date - Hyderabad", collapsing into
// one dedupe group before this stripping was added).
const PROMOTER_NOISE_PATTERNS: RegExp[] = [
  /\bpresents?\b/g,
  /\bin association with\b/g,
  /\bpowered by\b/g,
  /\bfeat\b/g,
  /\bft\b/g,
  /\blive in concert\b/g,
  /\blive in hyderabad\b/g,
  /\bhyderabad edition\b/g,
];

export function normalizeTitle(title: string): string {
  let cleaned = title.toLowerCase().replace(/[^\w\s]/g, " ");
  for (const pattern of PROMOTER_NOISE_PATTERNS) cleaned = cleaned.replace(pattern, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned.replace(/\bhyderabad\b$/, "").trim();
}

export function normalizeVenue(venueName: string | null): string {
  if (!venueName) return "";
  return normalizeTitle(venueName);
}

/** Jaro similarity: fraction of matching characters within a proximity window, penalised for transpositions. */
function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }

  return (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
}

/** Jaro-Winkler: Jaro similarity boosted for a shared prefix, per data-model.md 8.2. */
function jaroWinklerSimilarity(a: string, b: string, prefixScale = 0.1): number {
  const jaro = jaroSimilarity(a, b);
  const maxPrefix = 4;
  let prefixLength = 0;
  while (prefixLength < maxPrefix && prefixLength < a.length && prefixLength < b.length && a[prefixLength] === b[prefixLength]) {
    prefixLength += 1;
  }
  return jaro + prefixLength * prefixScale * (1 - jaro);
}

/** Jaro-Winkler similarity of the two titles, after noise stripping. 1 for identical, 0 for empty input. */
export function titleSimilarity(a: string, b: string): number {
  return jaroWinklerSimilarity(normalizeTitle(a), normalizeTitle(b));
}

function venueSimilarity(a: string | null, b: string | null): number {
  const normalizedA = normalizeVenue(a);
  const normalizedB = normalizeVenue(b);
  if (!normalizedA || !normalizedB) return 0;
  return jaroWinklerSimilarity(normalizedA, normalizedB);
}

/**
 * Whether the venue evidence permits a match. A source that omits the venue
 * says nothing about it, so absence abstains rather than vetoing; the title
 * and time gates still have to pass on their own. Scoring a missing venue as 0
 * is what made an identically titled event at the identical minute fail to
 * match just because one listing left the field blank.
 */
function venuePermitsMatch(a: EventRow, b: EventRow): boolean {
  if (!hasRealVenue(a.venueName) || !hasRealVenue(b.venueName)) return true;
  return venueSimilarity(a.venueName, b.venueName) >= VENUE_NAME_THRESHOLD;
}

function isSameRawRecord(a: EventRow, b: EventRow): boolean {
  return a.source === b.source && a.sourceEventId === b.sourceEventId;
}

function withinMatchWindow(a: EventRow, b: EventRow): boolean {
  if (a.timeKind !== b.timeKind) return false;
  if (a.timeKind === "date-only")
    return istCalendarDate(new Date(a.startsAt)) === istCalendarDate(new Date(b.startsAt)) && venuePermitsMatch(a, b);
  const timeDeltaMs = Math.abs(new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return timeDeltaMs <= MATCH_WINDOW_MS && venuePermitsMatch(a, b);
}

/**
 * For each row, the indices of every other candidate sharing its venue and
 * time window, regardless of title.
 *
 * Walking rows in start-time order lets the inner loop stop at the first
 * candidate past the time window instead of scanning the whole list.
 * Everything it skips would have failed withinMatchWindow anyway, so the
 * reachable pair set is unchanged; only the work to find it shrinks.
 */
function matchWindowNeighbors(rows: EventRow[]): number[][] {
  // Every index below comes from rows.map, so startTimes, rows and neighbors
  // all have an entry for it.
  const startTimes = rows.map((row) => new Date(row.startsAt).getTime());
  const byTime = rows.map((_, index) => index).sort((a, b) => startTimes[a]! - startTimes[b]!);
  const neighbors: number[][] = rows.map(() => []);

  for (let a = 0; a < byTime.length; a += 1) {
    const i = byTime[a]!;
    const rowI = rows[i]!;
    for (let b = a + 1; b < byTime.length; b += 1) {
      const j = byTime[b]!;
      const rowJ = rows[j]!;
      if (startTimes[j]! - startTimes[i]! > (rowI.timeKind === "date-only" ? 24 * 60 * 60 * 1000 : MATCH_WINDOW_MS)) break;
      // A source's own multi-slot declaration (same source_event_id, two
      // scheduleSlots) is that source telling us these are deliberately
      // different bookable moments, e.g. a recurring class's AM and PM
      // sessions. Live data showed two such slots 90 minutes apart with an
      // identical title and venue; fuzzy dedupe must never second-guess that
      // and collapse a real, distinct, bookable occurrence out of existence.
      if (isSameRawRecord(rowI, rowJ)) continue;
      if (!withinMatchWindow(rowI, rowJ)) continue;
      neighbors[i]!.push(j);
      neighbors[j]!.push(i);
    }
  }

  for (const list of neighbors) list.sort((a, b) => a - b);
  return neighbors;
}

/**
 * Groups events that start within 90 minutes of each other at a similarly
 * named venue with a similarly worded title into dedupe groups keyed by the
 * best eligible member's id (the canonical row). This is the secondary,
 * fuzzy pass; the primary dedupe is the (source, source_event_id,
 * source_slot_id) unique constraint in the DB, which prevents the same
 * occurrence from a single source ever being stored twice. This fuzzy pass
 * is what catches the same real event listed under two different sources.
 *
 * Candidate pairs come from matchWindowNeighbors, which bounds the scan to
 * the relevant time window rather than comparing every row against every other.
 */
export function groupDuplicates(rows: EventRow[], titleThreshold: number = DEFAULT_TITLE_THRESHOLD): Map<string, string[]> {
  const sorted = [...rows].sort(
    (a, b) =>
      Number(hasRealVenue(b.venueName)) - Number(hasRealVenue(a.venueName)) ||
      sourceTrustTier(a.source) - sourceTrustTier(b.source) ||
      a.firstSeenAt.localeCompare(b.firstSeenAt),
  );
  const neighbors = matchWindowNeighbors(sorted);
  const groups = new Map<string, string[]>();
  const assigned = new Set<string>();

  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i]!; // i < sorted.length
    const rowNeighbors = neighbors[i]!; // matchWindowNeighbors returns one list per row
    if (assigned.has(row.id)) continue;
    const members = [row.id];
    const records = new Set([`${row.source}\u0000${row.sourceEventId}`]);
    assigned.add(row.id);
    const effectiveThreshold = rowNeighbors.length > BUSY_CLUSTER_NEIGHBOR_COUNT ? BUSY_CLUSTER_TITLE_THRESHOLD : titleThreshold;

    for (const j of rowNeighbors) {
      if (j <= i) continue;
      const other = sorted[j]!; // j is an index from matchWindowNeighbors
      if (assigned.has(other.id)) continue;
      const record = `${other.source}\u0000${other.sourceEventId}`;
      if (records.has(record)) continue;
      if (titleSimilarity(row.title, other.title) < effectiveThreshold) continue;

      members.push(other.id);
      records.add(record);
      assigned.add(other.id);
    }

    groups.set(row.id, members);
  }

  return groups;
}
