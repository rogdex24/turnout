import { expect, test } from "bun:test";
import { groupDuplicates, titleSimilarity } from "../src/catalog/dedupe.js";
import type { EventRow } from "../src/catalog/types.js";

test("groups a near-miss title at the same venue and night, across two sources", () => {
  const rows: EventRow[] = [
    {
      id: "a",
      source: "communitie",
      sourceEventId: "evt-1",
      title: "Micless with Merakee",
      venueName: "Lamakaan",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T13:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "b",
      source: "allevents",
      sourceEventId: "evt-2",
      title: "Micless with Merakee | Hyderabad Edition",
      venueName: "Lamakaan",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T13:30:00.000Z",
      firstSeenAt: "2026-09-02T00:00:00.000Z",
    },
  ];
  const groups = groupDuplicates(rows);
  expect(groups.size).toBe(1);
  expect(groups.get("a")).toEqual(["a", "b"]);
});

test("does not group two different shows at the same venue and night", () => {
  const rows: EventRow[] = [
    {
      id: "a",
      source: "communitie",
      sourceEventId: "evt-1",
      title: "Micless with Merakee",
      venueName: "Lamakaan",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T13:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "b",
      source: "allevents",
      sourceEventId: "evt-2",
      title: "Quiz Night",
      venueName: "Lamakaan",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T13:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
  ];
  const groups = groupDuplicates(rows);
  expect(groups.size).toBe(2);
});

test("does not group the same title at different venues", () => {
  const rows: EventRow[] = [
    {
      id: "a",
      source: "communitie",
      sourceEventId: "evt-1",
      title: "Open Mic Night",
      venueName: "Lamakaan",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T13:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "b",
      source: "allevents",
      sourceEventId: "evt-2",
      title: "Open Mic Night",
      venueName: "Roastery Coffee House",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T13:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
  ];
  const groups = groupDuplicates(rows);
  expect(groups.size).toBe(2);
});

test("titleSimilarity is 1 for identical titles and well below the match threshold for unrelated ones", () => {
  expect(titleSimilarity("Boulder Jam", "boulder jam")).toBe(1);
  expect(titleSimilarity("Boulder Jam", "Quiz Night")).toBeLessThan(0.6);
});

test("groups the same real event listed under two different sources, within the 90-minute window", () => {
  const rows: EventRow[] = [
    {
      id: "communitie-a",
      source: "communitie",
      sourceEventId: "evt-1",
      title: "Open Mic at Lamakaan",
      venueName: "Lamakaan",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T13:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "allevents-b",
      source: "allevents",
      sourceEventId: "evt-2",
      title: "Open Mic Night at Lamakaan Hyderabad",
      venueName: "Lamakaan: Hyderabad",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T14:00:00.000Z",
      firstSeenAt: "2026-09-02T00:00:00.000Z",
    },
  ];
  const groups = groupDuplicates(rows);
  expect(groups.size).toBe(1);
  expect(groups.get("communitie-a")).toEqual(["communitie-a", "allevents-b"]);
});

test("does not group the same venue and title outside the 90-minute window", () => {
  const rows: EventRow[] = [
    {
      id: "a",
      source: "communitie",
      sourceEventId: "evt-1",
      title: "Open Mic at Lamakaan",
      venueName: "Lamakaan",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T13:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "b",
      source: "allevents",
      sourceEventId: "evt-2",
      title: "Open Mic at Lamakaan",
      venueName: "Lamakaan",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T16:00:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
  ];
  const groups = groupDuplicates(rows);
  expect(groups.size).toBe(2);
});

test("never merges two occurrences that came from one source's own single multi-slot record", () => {
  // Live communitie data has exactly this shape: a recurring class's own two
  // schedule slots, same title, same venue, 90 minutes apart. Both are real,
  // distinct, bookable sessions; the source itself declared them separate
  // (same source_event_id, two source_slot_id occurrences upstream), so
  // fuzzy dedupe must never second-guess that and collapse one out of
  // existence.
  const rows: EventRow[] = [
    {
      id: "a",
      source: "communitie",
      sourceEventId: "evt-1",
      title: "Boulder Jam",
      venueName: "Crag Studio",
      timeKind: "timed" as const,
      startsAt: "2026-09-11T11:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "b",
      source: "communitie",
      sourceEventId: "evt-1",
      title: "Boulder Jam",
      venueName: "Crag Studio",
      timeKind: "timed" as const,
      startsAt: "2026-09-11T13:00:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
  ];
  const groups = groupDuplicates(rows);
  expect(groups.size).toBe(2);
});

test("still merges the same event resubmitted under a second id on the same source", () => {
  const rows: EventRow[] = [
    {
      id: "a",
      source: "communitie",
      sourceEventId: "evt-1",
      title: "Micless with Merakee",
      venueName: "Lamakaan",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T13:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "b",
      source: "communitie",
      sourceEventId: "evt-2",
      title: "Micless with Merakee | Hyderabad Edition",
      venueName: "Lamakaan",
      timeKind: "timed" as const,
      startsAt: "2026-09-12T13:30:00.000Z",
      firstSeenAt: "2026-09-02T00:00:00.000Z",
    },
  ];
  const groups = groupDuplicates(rows);
  expect(groups.size).toBe(1);
});

const at = (iso: string, id: string, source: string): EventRow => ({
  id,
  source,
  sourceEventId: id,
  title: "Open Mic Night",
  venueName: "Lamakaan",
  timeKind: "timed" as const,
  startsAt: iso,
  firstSeenAt: "2026-09-01T00:00:00.000Z",
});

test("groups a pair sitting exactly on the 90-minute window edge", () => {
  const rows = [at("2026-09-12T13:30:00.000Z", "a", "communitie"), at("2026-09-12T15:00:00.000Z", "b", "allevents")];
  expect(groupDuplicates(rows).get("a")).toEqual(["a", "b"]);
});

test("does not group a pair one millisecond past the window edge", () => {
  const rows = [at("2026-09-12T13:30:00.000Z", "a", "communitie"), at("2026-09-12T15:00:00.001Z", "b", "allevents")];
  expect(groupDuplicates(rows).size).toBe(2);
});

test("groups the same pair whichever order the rows arrive in", () => {
  const early = at("2026-09-12T13:30:00.000Z", "a", "communitie");
  const late = at("2026-09-12T14:00:00.000Z", "b", "allevents");
  for (const rows of [
    [late, early],
    [early, late],
  ]) {
    const groups = groupDuplicates(rows);
    expect(groups.size).toBe(1);
    expect([...groups.values()][0]!.sort()).toEqual(["a", "b"]);
  }
});

// first_seen_at ties are the common case: every row created by one sync run
// shares its timestamp, so the sort is stable rather than meaningful and the
// canonical falls to whichever adapter registry.ts lists first.
test("picks the earliest first_seen_at as canonical, falling back to input order on a tie", () => {
  const a = at("2026-09-12T13:30:00.000Z", "a", "communitie");
  const b = { ...at("2026-09-12T14:00:00.000Z", "b", "luma"), firstSeenAt: "2026-08-01T00:00:00.000Z" };
  expect(groupDuplicates([a, b]).get("b")).toEqual(["b", "a"]);
  expect(groupDuplicates([b, a]).get("b")).toEqual(["b", "a"]);
});

test("finds a match separated by many out-of-window rows", () => {
  const filler = Array.from({ length: 50 }, (_, i) => at(new Date(Date.UTC(2026, 8, 20 + i)).toISOString(), `filler-${i}`, "district"));
  const rows = [at("2026-09-12T13:30:00.000Z", "a", "communitie"), ...filler, at("2026-09-12T14:00:00.000Z", "b", "allevents")];
  expect(groupDuplicates(rows).get("a")).toEqual(["a", "b"]);
});

test("merges across sources when one of them omits the venue", () => {
  const rows: EventRow[] = [
    {
      id: "a",
      source: "townscript",
      sourceEventId: "evt-1",
      title: "Soldierathon Hyderabad",
      venueName: null,
      timeKind: "timed" as const,
      startsAt: "2026-09-26T23:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "b",
      source: "allevents",
      sourceEventId: "evt-2",
      title: "Soldierathon Hyderabad",
      venueName: "Artillery Centre",
      timeKind: "timed" as const,
      startsAt: "2026-09-26T23:30:00.000Z",
      firstSeenAt: "2026-09-02T00:00:00.000Z",
    },
  ];
  expect(groupDuplicates(rows).get("b")).toEqual(["b", "a"]);
});

test("merges when two sources name the same venue at different granularity", () => {
  const rows: EventRow[] = [
    {
      id: "a",
      source: "district",
      sourceEventId: "evt-1",
      title: "NYE Party",
      venueName: "Novotel HICC",
      timeKind: "timed" as const,
      startsAt: "2026-12-31T18:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "b",
      source: "meraevents",
      sourceEventId: "evt-2",
      title: "NYE Party",
      venueName: "Novotel Hyderabad Convention Centre",
      timeKind: "timed" as const,
      startsAt: "2026-12-31T18:30:00.000Z",
      firstSeenAt: "2026-09-02T00:00:00.000Z",
    },
  ];
  expect(groupDuplicates(rows).get("b")).toEqual(["b", "a"]);
});

test("a missing venue abstains, it does not excuse an unrelated title", () => {
  const rows: EventRow[] = [
    {
      id: "a",
      source: "townscript",
      sourceEventId: "evt-1",
      title: "Soldierathon Hyderabad",
      venueName: null,
      timeKind: "timed" as const,
      startsAt: "2026-09-26T23:30:00.000Z",
      firstSeenAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "b",
      source: "allevents",
      sourceEventId: "evt-2",
      title: "Baroque Chamber Recital",
      venueName: null,
      timeKind: "timed" as const,
      startsAt: "2026-09-26T23:30:00.000Z",
      firstSeenAt: "2026-09-02T00:00:00.000Z",
    },
  ];
  expect(groupDuplicates(rows).size).toBe(2);
});

test("a cross-source bridge never groups two slots from one source record", () => {
  const bridge = { ...at("2026-09-12T14:00:00.000Z", "bridge", "district"), firstSeenAt: "2026-08-01T00:00:00Z" };
  const slots = ["13:30", "14:30"].map((clock, i) => ({
    ...at(`2026-09-12T${clock}:00.000Z`, `slot-${i}`, "communitie"),
    sourceEventId: "same-record",
  }));
  const groups = groupDuplicates([bridge, ...slots]);
  expect(groups.size).toBe(2);
  expect([...groups.values()].map((members) => members.length).sort()).toEqual([1, 2]);
});

test("a later trusted API copy beats an earlier agent or HTML copy", () => {
  for (const source of ["agent:grok", "unknown", "district", "allevents", "bookmyshow", "growezy"]) {
    const early = { ...at("2026-09-12T13:30:00.000Z", "early", source), firstSeenAt: "2026-08-01T00:00:00Z" };
    const late = at("2026-09-12T13:30:00.000Z", "late", "communitie");
    expect(groupDuplicates([early, late]).get("late")).toEqual(["late", "early"]);
  }
});

test("a real venue outranks an earlier incomplete trusted row", () => {
  for (const venueName of [null, "", "  ", "TBD", "TBA", "Venue TBD", "Venue TBA", "Venue to be announced", "venue to be decided"]) {
    const early = { ...at("2026-09-12T13:30:00.000Z", "early", "communitie"), venueName, firstSeenAt: "2026-08-01T00:00:00Z" };
    const late = at("2026-09-12T13:30:00.000Z", "late", "agent:grok");
    expect(groupDuplicates([early, late]).get("late")).toEqual(["late", "early"]);
  }
});

test("date-only rows match the same IST day but never a timed row", () => {
  const base = { sourceEventId: "event", title: "Open Mic", venueName: "Lamakaan", firstSeenAt: "2026-09-01T00:00:00Z" };
  const rows = [
    { ...base, id: "a", source: "bookmyshow", startsAt: "2026-09-07T18:30:00.000Z", timeKind: "date-only" as const },
    { ...base, id: "b", source: "unknown", startsAt: "2026-09-08T12:00:00.000Z", timeKind: "date-only" as const },
    { ...base, id: "c", source: "luma", startsAt: "2026-09-07T18:30:00.000Z", timeKind: "timed" as const },
    { ...base, id: "d", source: "district", startsAt: "2026-09-08T18:30:00.000Z", timeKind: "date-only" as const },
  ];
  const groups = groupDuplicates(rows);
  expect(groups.size).toBe(3);
  expect(groups.get("a")).toEqual(["a", "b"]);
});
