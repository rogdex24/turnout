import { AT_CAFE_METRES, haversineMetres, toPoint, walkTo } from "./walk";

const cafe = { lat: 17.385, lng: 78.4867 };
/** One degree of latitude is about 111.2 km, so this many degrees is about this many metres north of the cafe. */
const northOf = (metres: number) => ({ lat: cafe.lat + metres / 111_195, lng: cafe.lng });

describe("haversineMetres", () => {
  it("is zero for the same point and the same both ways", () => {
    const other = { lat: 17.4, lng: 78.5 };
    expect(haversineMetres(cafe, cafe)).toBe(0);
    expect(haversineMetres(cafe, other)).toBeCloseTo(haversineMetres(other, cafe), 6);
  });

  it("measures a known distance", () => {
    // Charminar to Hussain Sagar's Buddha statue is about 5.9 km as the crow flies.
    const charminar = { lat: 17.3616, lng: 78.4747 };
    const buddha = { lat: 17.4239, lng: 78.4738 };
    expect(haversineMetres(charminar, buddha)).toBeGreaterThan(6_800);
    expect(haversineMetres(charminar, buddha)).toBeLessThan(7_000);
  });

  it("holds across the antimeridian", () => {
    expect(haversineMetres({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeCloseTo(22_239, -2);
  });
});

describe("walkTo", () => {
  it("is at the cafe within 75 metres", () => {
    expect(AT_CAFE_METRES).toBe(75);
    expect(walkTo(northOf(0), cafe)).toEqual({ kind: "at_cafe" });
    expect(walkTo(northOf(74), cafe)).toEqual({ kind: "at_cafe" });
  });

  it("is a walk just past 75 metres, and takes at least a minute", () => {
    const result = walkTo(northOf(80), cafe);
    expect(result.kind).toBe("walk");
    if (result.kind === "walk") expect(result.minutes).toBe(1);
  });

  it("stretches the straight distance by 1.3 and walks at 4.8 km/h", () => {
    // 1 km straight is 1.3 km by road, which is 16.25 minutes at 80 m a minute.
    const result = walkTo(northOf(1_000), cafe);
    expect(result).toEqual({ kind: "walk", minutes: 16, metres: 1_300 });
  });

  it("gives a long walk in minutes, not hours", () => {
    const result = walkTo(northOf(8_000), cafe);
    expect(result.kind === "walk" && result.minutes).toBe(130);
  });
});

describe("toPoint", () => {
  it("needs both numbers inside the globe", () => {
    expect(toPoint(17.4, 78.4)).toEqual({ lat: 17.4, lng: 78.4 });
    expect(toPoint(null, 78.4)).toBeNull();
    expect(toPoint(17.4, undefined)).toBeNull();
    expect(toPoint(91, 0)).toBeNull();
    expect(toPoint(0, -181)).toBeNull();
    expect(toPoint(Number.NaN, 0)).toBeNull();
  });
});
