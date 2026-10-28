import { lookingLine } from "./lookingLine";

describe("lookingLine", () => {
  it("says nobody yet for 0", () => {
    expect(lookingLine(0)).toEqual({ numeral: null, text: "Nobody is looking for a group yet. Be the first." });
  });

  it("says one person for 1", () => {
    expect(lookingLine(1)).toEqual({ numeral: "1", text: "person is looking for a group" });
  });

  it("says people for many", () => {
    expect(lookingLine(12)).toEqual({ numeral: "12", text: "people are looking for a group" });
  });

  it("groups digits the Indian way", () => {
    expect(lookingLine(12345)?.numeral).toBe("12,345");
    expect(lookingLine(123456)?.numeral).toBe("1,23,456");
  });

  it("shows no line when the count is not known", () => {
    expect(lookingLine(null)).toBeNull();
    expect(lookingLine(undefined)).toBeNull();
  });

  it("treats a bad count as not known", () => {
    expect(lookingLine(-1)).toBeNull();
    expect(lookingLine(Number.NaN)).toBeNull();
  });
});
