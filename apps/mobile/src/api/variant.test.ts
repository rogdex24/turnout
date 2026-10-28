import { allowSeedNumbers, showsRealMap } from "./variant";

describe("allowSeedNumbers", () => {
  it("is on for development and e2e builds only", () => {
    expect(allowSeedNumbers("development")).toBe(true);
    expect(allowSeedNumbers("e2e")).toBe(true);
    expect(allowSeedNumbers("preview")).toBe(false);
    expect(allowSeedNumbers("production")).toBe(false);
  });
});

describe("showsRealMap", () => {
  it("needs a Maps key on Android and none on iOS", () => {
    expect(showsRealMap("android", "production", true)).toBe(true);
    expect(showsRealMap("android", "development", false)).toBe(false);
    expect(showsRealMap("ios", "development", false)).toBe(true);
  });

  it("is off in the e2e build, so the flows see the static card on both phones", () => {
    expect(showsRealMap("android", "e2e", true)).toBe(false);
    expect(showsRealMap("ios", "e2e", false)).toBe(false);
  });
});
