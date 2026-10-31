import { displayFaces, fontScaling } from "@turnout/design-tokens";
import { displayFaceStyle, fitDisplaySize, isLargeText, LARGEST_TEXT_SCALE, scaledMetrics, scaleFor } from "./textScale";

describe("scaleFor", () => {
  it("follows the person up to the cap", () => {
    expect(scaleFor("body", 2)).toBe(2);
    expect(scaleFor("display", LARGEST_TEXT_SCALE)).toBe(fontScaling.display.maxFontSizeMultiplier);
    expect(scaleFor("label", 1.1)).toBe(1.1);
    expect(scaleFor("label", 2)).toBe(1.3);
  });

  // The largest iOS text size is about 3.1 for body text. Past 2 one message filled the thread and the phone field hid its +91.
  it("stops every style at 2, the largest text size the stories check", () => {
    for (const token of ["title", "body", "meta", "control", "display"] as const) {
      expect(scaleFor(token, 3.1)).toBeLessThanOrEqual(LARGEST_TEXT_SCALE);
    }
    expect(scaleFor("body", 3.1)).toBe(2);
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

  it("shrinks a title whose lines would be taller than the box", () => {
    // Across 296 "The Monsoon Theory" takes three lines at 70, which are 189 tall. At 46 it takes two, which are 82.8 tall.
    expect(fitDisplaySize("The Monsoon Theory", 296, "display-poster", 3)).toBe(poster.maxFontSize);
    expect(fitDisplaySize("The Monsoon Theory", 296, "display-poster", 3, 112)).toBe(46);
  });

  it("counts a glyph at 0.58 of its size, so a title that wraps one line too many does not pass as fitting", () => {
    // 10 glyphs at 50 are 290 wide, which fits 296. At the old 0.42 share these 12 glyphs would have passed at 50 (252 wide), though they are 348 wide.
    expect(fitDisplaySize("ABCDEFGHIJ", 296, "display-poster", 1)).toBe(50);
    expect(fitDisplaySize("ABCDEFGHIJKL", 296, "display-poster", 1)).toBe(42);
  });

  it("lets a word wider than the box break across lines instead of giving up", () => {
    // 34 letters take two lines at 36 across 296 (14 fit a line at 0.58), so a three-line title keeps a size above the minimum.
    const word = "Supercalifragilisticexpialidocious";
    expect(fitDisplaySize(word, 296, "display-poster", 3)).toBeGreaterThan(poster.minFontSize);
    expect(fitDisplaySize(word, 296, "display-poster", 1)).toBe(poster.minFontSize);
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
