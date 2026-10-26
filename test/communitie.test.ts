import { expect, test } from "bun:test";
import type { RawEvent } from "../src/ingestion/sources/communitie.js";
import { fetchAllEvents, PAGE_SIZE } from "../src/ingestion/sources/communitie.js";

function makeEvent(id: string): RawEvent {
  return { id, title: id, status: "LIVE", approvalStatus: "APPROVED" };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

test("stops paging once a page comes back shorter than the page size", async () => {
  const pages: RawEvent[][] = [
    Array.from({ length: PAGE_SIZE }, (_, i) => makeEvent(`page0-${i}`)),
    [makeEvent("page1-0"), makeEvent("page1-1")],
  ];
  let calls = 0;
  const fetchImpl = async () => {
    const body = pages[calls] ?? [];
    calls += 1;
    return jsonResponse(body);
  };

  const events = await fetchAllEvents({ fetchImpl, sleepMs: 0 });
  expect(events.length).toBe(PAGE_SIZE + 2);
  expect(calls).toBe(2);
});

test("stops paging immediately on an empty page", async () => {
  const fetchImpl = async () => jsonResponse([]);
  const events = await fetchAllEvents({ fetchImpl, sleepMs: 0 });
  expect(events.length).toBe(0);
});

test("deduplicates events that reappear across pages", async () => {
  const pages: RawEvent[][] = [
    Array.from({ length: PAGE_SIZE }, (_, i) => makeEvent(i === 0 ? "repeat" : `page0-${i}`)),
    [makeEvent("repeat")],
  ];
  let calls = 0;
  const fetchImpl = async () => {
    const body = pages[calls] ?? [];
    calls += 1;
    return jsonResponse(body);
  };

  const events = await fetchAllEvents({ fetchImpl, sleepMs: 0 });
  const ids = events.map((event) => event.id);
  expect(ids.filter((id) => id === "repeat").length).toBe(1);
});

test("accepts a Spring-Data-style {content: [...]} envelope", async () => {
  const fetchImpl = async () => jsonResponse({ content: [makeEvent("a")], totalPages: 1 });
  const events = await fetchAllEvents({ fetchImpl, sleepMs: 0 });
  expect(events.length).toBe(1);
  expect(events[0]!.id).toBe("a");
});

test("throws with a descriptive error on a non-OK response", async () => {
  const fetchImpl = async () => new Response("nope", { status: 500, statusText: "Internal Server Error" });
  await expect(fetchAllEvents({ fetchImpl, sleepMs: 0 })).rejects.toThrow(/500/);
});
