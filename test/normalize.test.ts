import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { RawEvent } from "../src/ingestion/sources/communitie.js";
import { normalizeEvent } from "../src/ingestion/sources/communitie.js";

const fixturesDir = path.join(import.meta.dir, "fixtures");

function loadFixture(name: string): RawEvent[] {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8")) as RawEvent[];
}

test("explodes multi-slot events into one occurrence per schedule slot", () => {
  const boulderJam = loadFixture("events-page-1.json")[0]!;
  const occurrences = normalizeEvent(boulderJam);
  expect(occurrences.length).toBe(2);
  expect(occurrences[0]!.sourceEventId).toBe(boulderJam.id);
  expect(occurrences[0]!.venueName).toBe("Crag Studio - Gachibowli");
  expect(occurrences[0]!.startsAt).toBe("2026-09-11T11:30:00.000Z");
  expect(occurrences[0]!.endsAt).toBe("2026-09-11T13:00:00.000Z");
});

test("marks a zero-price event as free", () => {
  const events = loadFixture("events-page-1.json");
  const merakee = events.find((event) => event.id === "90a734a9-898a-43ab-8312-6eaa908d339c")!;
  const occurrence = normalizeEvent(merakee)[0]!;
  expect(occurrence.isFree).toBe(true);
  expect(occurrence.priceMin).toBe(0);
});

test("holds events that are not approved, publishing nothing for them", () => {
  const events = loadFixture("events-page-1.json");
  const pending = events.find((event) => event.id === "not-approved-event")!;
  expect(normalizeEvent(pending)).toEqual([]);
});

test("skips schedule slots without a parseable date", () => {
  const raw: RawEvent = {
    id: "broken-date",
    title: "Broken",
    status: "LIVE",
    approvalStatus: "APPROVED",
    timeSlots: [
      {
        venueName: "Nowhere",
        scheduleSlots: [{ id: "slot-1", slotDate: "", startTime: "19:00:00" }],
      },
    ],
  };
  expect(normalizeEvent(raw)).toEqual([]);
});

test("skips inactive schedule slots", () => {
  const raw: RawEvent = {
    id: "cancelled-slot",
    title: "Cancelled Slot",
    status: "LIVE",
    approvalStatus: "APPROVED",
    timeSlots: [
      {
        venueName: "Nowhere",
        scheduleSlots: [{ id: "slot-1", slotDate: "2026-09-12", startTime: "19:00:00", active: false }],
      },
    ],
  };
  expect(normalizeEvent(raw)).toEqual([]);
});
