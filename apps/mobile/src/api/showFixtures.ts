import type { ApiEvent, ApiEventDetail, EventListResponse } from "@turnout/contract/events";
import type { AreaList } from "./shows";

/** Made-up shows for tests and stories. Nothing here is a real event, venue or link. */
export function showFixture(overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: "monsoon-theory",
    url: "https://go.example.com/e/monsoon-theory",
    title: "The Monsoon Theory",
    is_all_day: false,
    starts_at: "2026-10-30T14:30:00.000Z",
    starts_at_local: "2026-10-30T20:00:00+05:30",
    ends_at: null,
    category: "music",
    venue: { name: "Phoenix Arena", area: "hitec-city", lat: 17.44, lng: 78.38 },
    is_free: false,
    price_min: 1499,
    price_max: 2999,
    currency: "INR",
    source: { name: "BookMyShow", url: "https://example.com/source/monsoon-theory" },
    ticket_url: "https://example.com/tickets/monsoon-theory",
    image_url: null,
    group_eligible: true,
    ...overrides,
  };
}

export function showDetailFixture(overrides: Partial<ApiEventDetail> = {}): ApiEventDetail {
  return {
    ...showFixture(),
    description: "Eight musicians, one rainy-season set list.",
    alternate_ticket_urls: [],
    ...overrides,
  };
}

/** Five shows over three days, the way the list comes back from the server. */
export const SHOWS: ApiEvent[] = [
  showFixture(),
  showFixture({
    id: "biryani-wars",
    title: "The Biryani Wars",
    category: "theatre",
    starts_at_local: "2026-10-31T19:30:00+05:30",
    venue: { name: "Ravindra Bharathi", area: "banjara-hills", lat: null, lng: null },
    price_min: 500,
    price_max: null,
  }),
  showFixture({
    id: "telugu-standup",
    title: "Telugu Stand-up Night",
    category: "comedy",
    starts_at_local: "2026-10-31T21:00:00+05:30",
    venue: { name: "The Moonshine Project", area: "jubilee-hills", lat: null, lng: null },
    price_min: 599,
    price_max: null,
  }),
  showFixture({
    id: "open-mic",
    title: "Open Mic Evening",
    category: "comedy",
    starts_at_local: "2026-11-01T18:00:00+05:30",
    is_free: true,
    price_min: null,
    price_max: null,
    venue: { name: "Lamakaan", area: "banjara-hills", lat: null, lng: null },
  }),
  showFixture({
    id: "jazz-night",
    title: "Jazz at the Lawn",
    category: "music",
    starts_at_local: "2026-11-01T20:30:00+05:30",
    price_min: 800,
    price_max: 1200,
    venue: { name: null, area: "jubilee-hills", lat: null, lng: null },
  }),
];

export function eventPage(events: ApiEvent[], nextCursor: string | null = null): EventListResponse {
  return {
    generated_at: "2026-10-30T12:00:00.000Z",
    timezone: "Asia/Kolkata",
    city: "Hyderabad",
    count: events.length,
    next_cursor: nextCursor,
    events,
  };
}

export const AREAS: AreaList = {
  areas: [
    { slug: "hitec-city", label: "Hitec City", event_count: 4 },
    { slug: "jubilee-hills", label: "Jubilee Hills", event_count: 3 },
    { slug: "banjara-hills", label: "Banjara Hills", event_count: 5 },
    { slug: "gachibowli", label: "Gachibowli", event_count: 0 },
  ],
};

/** The server's answer for areas, with the fields the app does not read. */
export const areasBody = () => ({
  generated_at: "2026-10-30T12:00:00.000Z",
  timezone: "Asia/Kolkata",
  city: "Hyderabad",
  count: AREAS.areas.length,
  ...AREAS,
});
