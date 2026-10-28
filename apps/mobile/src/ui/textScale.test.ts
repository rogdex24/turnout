import { displayFaces, fontScaling } from "@turnout/design-tokens";
import { displayFaceStyle, fitDisplaySize, isLargeText, LARGEST_TEXT_SCALE, scaledMetrics, scaleFor } from "./textScale";

describe("scaleFor", () => {
  it("follows the person up to the cap", () => {
    expect(scaleFor("body", 2)).toBe(2);
    expect(scaleFor("display", LARGEST_TEXT_SCALE)).toBe(fontScaling.display.maxFontSizeMultiplier);
    expect(scaleFor("label", 1.1)).toBe(1.1);
    expect(scaleFor("label", 2)).toBe(1.3);
  });

  it("holds the display faces still", () => {
    expect(scaleFor("display-hero", 2)).toBe(1);
    expect(scaleFor("display-band", 2)).toBe(1);
  });

  it("scales the size and the line height together", () => {
    expect(scaledMetrics("body", 2)).toEqual({ fontSize: 30, lineHeight: 44 });
    expect(scaledMetrics("display-hero", 2)).toEqual({ fontSize: 116, lineHeight: 90 });
  });
});

describe("isLargeText", () => {
  it("starts at 1.3", () => {
    expect(isLargeText(1.29)).toBe(false);
    expect(isLargeText(1.3)).toBe(true);
  });
});

describe("fitDisplaySize", () => {
  const poster = displayFaces["display-poster"];

  it("uses the largest size for a short title", () => {
    expect(fitDisplaySize("Jam", 300, "display-poster", 3)).toBe(poster.maxFontSize);
  });

  it("shrinks a long title but never below the face's minimum", () => {
    const long = "An Evening of Stand Up Comedy and Improvised Songs With Friends";
    const size = fitDisplaySize(long, 300, "display-poster", 3);
    expect(size).toBeLessThan(poster.maxFontSize);
    expect(size).toBeGreaterThanOrEqual(poster.minFontSize);
    expect(fitDisplaySize("x ".repeat(400), 100, "display-poster", 3)).toBe(poster.minFontSize);
  });

  it("falls back to the minimum when one word cannot fit", () => {
    expect(fitDisplaySize("Supercalifragilisticexpialidocious", 80, "display-poster", 3)).toBe(poster.minFontSize);
  });

  it("allows more room when more lines are allowed", () => {
    const title = "Hyderabad Indie Music Night Live at the Lake";
    expect(fitDisplaySize(title, 240, "display-poster", 4)).toBeGreaterThanOrEqual(fitDisplaySize(title, 240, "display-poster", 2));
  });
});

describe("displayFaceStyle", () => {
  test("keeps the size inside the face's range and takes the face's line height", () => {
    const { minFontSize, maxFontSize, lineHeightRatio } = displayFaces["display-numeral"];
    expect(displayFaceStyle("display-numeral", 28)).toEqual({ fontSize: 28, lineHeight: Math.round(28 * lineHeightRatio) });
    expect(displayFaceStyle("display-numeral", 99).fontSize).toBe(maxFontSize);
    expect(displayFaceStyle("display-numeral", 1).fontSize).toBe(minFontSize);
  });
});
