import {
  countdownText,
  hereButton,
  hereCount,
  istClock,
  locationLine,
  mapRegion,
  mapsUrl,
  minutesUntil,
  venueWalkMinutes,
} from "./meetCard";

const MINUTE = 60_000;
// 6:00 PM in Hyderabad is 12:30 UTC.
const meetAt = "2026-11-07T12:30:00.000Z";
const meet = Date.parse(meetAt);

describe("istClock", () => {
  it("reads the moment on a Hyderabad clock", () => {
    expect(istClock(meetAt)).toEqual({ digits: "6:00", period: "PM", text: "6:00 PM" });
    expect(istClock("2026-11-07T18:30:00.000Z")).toEqual({ digits: "12:00", period: "AM", text: "12:00 AM" });
    expect(istClock("2026-11-07T06:30:00.000Z")?.text).toBe("12:00 PM");
    expect(istClock("2026-11-07T00:05:00.000Z")?.text).toBe("5:35 AM");
  });

  it("is null for text that is not a time", () => {
    expect(istClock("soon")).toBeNull();
  });
});

describe("countdownText", () => {
  it("counts in minutes under an hour and in hours and minutes above it", () => {
    expect(countdownText(meetAt, meet - 48 * MINUTE)).toBe("In 48 min");
    expect(countdownText(meetAt, meet - 47.5 * MINUTE)).toBe("In 48 min");
    expect(countdownText(meetAt, meet - 125 * MINUTE)).toBe("In 2 h 5 min");
    expect(countdownText(meetAt, meet - 120 * MINUTE)).toBe("In 2 h");
  });

  it("says nothing once the time has come", () => {
    expect(countdownText(meetAt, meet)).toBeNull();
    expect(countdownText(meetAt, meet + MINUTE)).toBeNull();
    expect(countdownText("soon", meet)).toBeNull();
  });

  it("rounds a partial minute up", () => {
    expect(minutesUntil(meetAt, meet - 1)).toBe(1);
    expect(minutesUntil(meetAt, meet + 1)).toBeLessThanOrEqual(0);
  });
});

describe("hereButton", () => {
  // The show starts at 7:00 PM (13:30 UTC), so the check-in opens at 5:30 PM.
  const startsAt = "2026-11-07T13:30:00.000Z";
  const start = Date.parse(startsAt);

  it("names the time it opens while it is early", () => {
    expect(hereButton(startsAt, start - 100 * MINUTE, false)).toEqual({ state: "early", opensAt: "5:30 PM" });
  });

  it("is open when the window is open", () => {
    expect(hereButton(startsAt, start - 60 * MINUTE, true)).toEqual({ state: "open" });
  });

  it("is closed after the window", () => {
    expect(hereButton(startsAt, start + 61 * MINUTE, false)).toEqual({ state: "closed" });
  });
});

describe("hereCount", () => {
  it("is null while nobody has checked in", () => {
    expect(hereCount([{ checkedIn: false }, { checkedIn: false }])).toBeNull();
  });

  it("counts the people who are here", () => {
    expect(hereCount([{ checkedIn: true }, { checkedIn: false }, { checkedIn: true }, { checkedIn: false }])).toEqual({ here: 2, of: 4 });
  });
});

describe("locationLine", () => {
  const cafe = { lat: 17.4435, lng: 78.3772 };
  const base = { beforeStart: true, permission: "granted" as const, canAskAgain: true, point: null, cafe };

  it("is hidden once the show has started, before the permission is read, and without a cafe pin", () => {
    expect(locationLine({ ...base, beforeStart: false })).toEqual({ kind: "hidden" });
    expect(locationLine({ ...base, permission: "unknown" })).toEqual({ kind: "hidden" });
    expect(locationLine({ ...base, cafe: null })).toEqual({ kind: "hidden" });
  });

  it("asks when the permission has not been given", () => {
    expect(locationLine({ ...base, permission: "undetermined" })).toEqual({ kind: "ask", canAsk: true });
    expect(locationLine({ ...base, permission: "denied", canAskAgain: true })).toEqual({ kind: "ask", canAsk: true });
  });

  it("points to Settings when the system will not ask again", () => {
    expect(locationLine({ ...base, permission: "denied", canAskAgain: false })).toEqual({ kind: "ask", canAsk: false });
  });

  it("waits for the first position", () => {
    expect(locationLine(base)).toEqual({ kind: "finding" });
  });

  it("says you are at the cafe within 75 m and a walk beyond it", () => {
    expect(locationLine({ ...base, point: { lat: cafe.lat + 0.0003, lng: cafe.lng } })).toEqual({ kind: "at_cafe" });
    const far = locationLine({ ...base, point: { lat: cafe.lat + 0.01, lng: cafe.lng } });
    expect(far.kind).toBe("walk");
  });
});

describe("venueWalkMinutes", () => {
  it("is the walk from the cafe to the venue, at least a minute", () => {
    expect(venueWalkMinutes({ lat: 17.4435, lng: 78.3772 }, { lat: 17.4435, lng: 78.3772 })).toBe(1);
    expect(venueWalkMinutes({ lat: 17.4435, lng: 78.3772 }, { lat: 17.4535, lng: 78.3772 })).toBeGreaterThan(10);
  });

  it("is null when a pin is missing", () => {
    expect(venueWalkMinutes(null, { lat: 1, lng: 1 })).toBeNull();
    expect(venueWalkMinutes({ lat: 1, lng: 1 }, null)).toBeNull();
  });
});

describe("mapsUrl", () => {
  it("is a geo link with the cafe's name as the label", () => {
    expect(mapsUrl({ lat: 17.44, lng: 78.37 }, "Cafe Niloufer")).toBe("geo:17.44,78.37?q=17.44,78.37(Cafe%20Niloufer)");
  });
});

describe("mapRegion", () => {
  it("is centred between the cafe and the venue with room around both", () => {
    const region = mapRegion({ lat: 17.44, lng: 78.37 }, { lat: 17.46, lng: 78.39 });
    expect(region.latitude).toBeCloseTo(17.45);
    expect(region.longitude).toBeCloseTo(78.38);
    expect(region.latitudeDelta).toBeCloseTo(0.044);
    expect(region.longitudeDelta).toBeCloseTo(0.044);
  });

  it("does not zoom in past the smallest view when the two are next door", () => {
    const region = mapRegion({ lat: 17.44, lng: 78.37 }, { lat: 17.4401, lng: 78.3701 });
    expect(region.latitudeDelta).toBe(0.004);
  });

  it("holds just the cafe when the venue has no pin", () => {
    expect(mapRegion({ lat: 17.44, lng: 78.37 }, null)).toEqual({
      latitude: 17.44,
      longitude: 78.37,
      latitudeDelta: 0.004,
      longitudeDelta: 0.004,
    });
  });
});
