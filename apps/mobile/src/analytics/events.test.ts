import { EVENT_KEYS, type EventName, forbiddenKey, safeProps } from "./events";

describe("forbiddenKey", () => {
  it.each([
    "lat",
    "lng",
    "latitude",
    "longitude",
    "location",
    "userLocation",
    "geo_hash",
    "gps",
    "coords",
    "address",
    "area",
    "city",
    "venue_area",
    "handle",
    "plan_handle",
    "username",
    "user_id",
    "userId",
    "person_id",
    "distinctId",
    "phone",
    "phone_hash",
    "email",
    "first_name",
    "name",
  ])("refuses %s", (key) => {
    expect(forbiddenKey({ [key]: "x" })).toBe(key);
  });

  it.each(["show_id", "plan_id", "groups_enabled", "source", "count", "platform"])("allows %s", (key) => {
    expect(forbiddenKey({ [key]: "x" })).toBeNull();
  });

  it("finds the key inside a nested object", () => {
    expect(forbiddenKey({ show_id: "a", extra: { lat: 12.9 } })).toBe("extra.lat");
  });
});

describe("the event registry", () => {
  const names = Object.keys(EVENT_KEYS) as EventName[];

  it("has at least the loop funnel", () => {
    expect(names).toEqual(expect.arrayContaining(["show_viewed", "go_tapped", "im_here_tapped"]));
  });

  it.each(names)("%s declares no location, handle or person property", (name) => {
    const bad = EVENT_KEYS[name].filter((key) => forbiddenKey({ [key]: 1 }) !== null);
    expect(bad).toEqual([]);
  });
});

describe("safeProps", () => {
  it("passes the declared properties through", () => {
    expect(safeProps("show_viewed", { show_id: "abc123" })).toEqual({ show_id: "abc123" });
  });

  it("drops a property the event does not declare", () => {
    expect(safeProps("show_viewed", { show_id: "abc123", surprise: "x" } as never)).toEqual({ show_id: "abc123" });
  });

  it("refuses the whole event when a location-like key is present", () => {
    expect(safeProps("show_viewed", { show_id: "abc123", lat: 12.9 } as never)).toBeNull();
    expect(safeProps("show_viewed", { show_id: "abc123", handle: "x" } as never)).toBeNull();
    expect(safeProps("show_viewed", { show_id: "abc123", user_id: "x" } as never)).toBeNull();
  });

  it("scrubs a phone number that ends up in a string value", () => {
    expect(safeProps("buy_tapped", { show_id: "call +1 555-0142 now" })).toEqual({ show_id: "call [phone] now" });
  });
});
