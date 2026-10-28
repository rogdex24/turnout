import type { ApiEvent } from "@turnout/contract/events";
import { areaLabel, dayGroups, istDate, listItems, mergePages } from "./showList";

function show(id: string, startsAtLocal: string): ApiEvent {
  return {
    id,
    url: `https://example.com/e/${id}`,
    title: `Show ${id}`,
    is_all_day: false,
    starts_at: null,
    starts_at_local: startsAtLocal,
    ends_at: null,
    category: "music",
    venue: { name: "Hall", area: "hitec-city", lat: null, lng: null },
    is_free: false,
    price_min: 500,
    price_max: null,
    currency: "INR",
    source: { name: "Source", url: "https://example.com/source" },
    ticket_url: "https://example.com/tickets",
    image_url: null,
    group_eligible: true,
  };
}

// 30 Oct 2026, 20:30 in India, as an instant.
const NOW = Date.parse("2026-10-30T20:30:00+05:30");

describe("istDate", () => {
  it("reads the calendar day in India, not on the phone", () => {
    expect(istDate(NOW)).toBe("2026-10-30");
    // 19:00 UTC on the 30th is already the 31st at 00:30 in India.
    expect(istDate(Date.parse("2026-10-30T19:00:00Z"))).toBe("2026-10-31");
  });
});

describe("dayGroups", () => {
  it("groups by the day written in starts_at_local, soonest first, and names today and tomorrow", () => {
    const groups = dayGroups(
      [
        show("c", "2026-11-02T19:00:00+05:30"),
        show("a", "2026-10-30T21:00:00+05:30"),
        show("b", "2026-10-31T19:30:00+05:30"),
        show("d", "2026-10-31T09:00:00+05:30"),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.date, g.relative, g.shows.map((s) => s.id)])).toEqual([
      ["2026-10-30", "today", ["a"]],
      ["2026-10-31", "tomorrow", ["d", "b"]],
      ["2026-11-02", null, ["c"]],
    ]);
  });

  it("puts a show that only has a date before the timed ones that day", () => {
    const groups = dayGroups([show("t", "2026-11-03T19:00:00+05:30"), show("d", "2026-11-03")], NOW);
    expect(groups[0]?.shows.map((s) => s.id)).toEqual(["d", "t"]);
  });

  it("skips a show whose time cannot be read", () => {
    expect(dayGroups([show("x", "soon")], NOW)).toEqual([]);
  });
});

describe("listItems", () => {
  it("features the first show, then shows the rest as tiles two to a row under day labels", () => {
    const groups = dayGroups(
      [
        show("a", "2026-10-30T21:00:00+05:30"),
        show("b", "2026-10-31T19:00:00+05:30"),
        show("c", "2026-10-31T20:00:00+05:30"),
        show("d", "2026-10-31T21:00:00+05:30"),
      ],
      NOW,
    );
    const items = listItems(groups);
    expect(
      items.map((i) =>
        i.kind === "day"
          ? `day:${i.date}:${i.count}`
          : i.kind === "featured"
            ? `featured:${i.show.id}`
            : `tiles:${i.shows.map((s) => s.id).join("+")}`,
      ),
    ).toEqual(["day:2026-10-30:1", "featured:a", "day:2026-10-31:3", "tiles:b+c", "tiles:d"]);
  });

  it("is empty for no shows", () => {
    expect(listItems([])).toEqual([]);
  });
});

describe("mergePages", () => {
  it("joins the pages and drops a show that shows up twice", () => {
    const merged = mergePages([
      { events: [show("a", "2026-10-30T21:00:00+05:30"), show("b", "2026-10-31T19:00:00+05:30")] },
      { events: [show("b", "2026-10-31T19:00:00+05:30"), show("c", "2026-11-01T19:00:00+05:30")] },
    ]);
    expect(merged.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});

describe("areaLabel", () => {
  it("title-cases a slug", () => {
    expect(areaLabel("hitec-city")).toBe("Hitec City");
    expect(areaLabel("secunderabad")).toBe("Secunderabad");
  });
});
