import { readFileSync } from "node:fs";
import { fontScaling, typography } from "@turnout/design-tokens";
import { DISPLAY_FACE_METRICS, displayLeadingFix, fontVariantFor, scalingFor, textClass } from "./typography";

const WEIGHT: Record<string, string> = {
  "400": "font-normal",
  "500": "font-medium",
  "600": "font-semibold",
  "700": "font-bold",
  "800": "font-extrabold",
  "900": "font-black",
};

describe("textClass", () => {
  test("has one entry per type token, with the token's family, weight and size utility", () => {
    for (const [token, style] of Object.entries(typography)) {
      const classes = (textClass as Record<string, string>)[token];
      expect(classes).toBeDefined();
      expect(classes).toContain(style.fontFamily === "Inter" ? "font-sans" : "font-display");
      expect(classes).toContain(WEIGHT[style.fontWeight]);
      expect(classes?.split(" ")).toContain(`text-${token}`);
    }
    expect(Object.keys(textClass).sort()).toEqual(Object.keys(typography).sort());
  });
});

test("font scaling and tabular figures come from the tokens", () => {
  expect(scalingFor("display")).toEqual(fontScaling.display);
  expect(scalingFor("display-hero")).toEqual({ allowFontScaling: false });
  expect(fontVariantFor("badge")).toEqual(["tabular-nums"]);
  expect(fontVariantFor("body")).toBeUndefined();
});

/** Reads unitsPerEm, the hhea ascent, descent and line gap, and the OS/2 cap height from a TrueType file. */
function fontMetrics(path: string) {
  const data = readFileSync(path);
  const tables = new Map<string, number>();
  for (let i = 0; i < data.readUInt16BE(4); i++)
    tables.set(data.toString("latin1", 12 + 16 * i, 16 + 16 * i), data.readUInt32BE(20 + 16 * i));
  const head = tables.get("head") ?? 0;
  const hhea = tables.get("hhea") ?? 0;
  const os2 = tables.get("OS/2") ?? 0;
  const em = data.readUInt16BE(head + 18);
  return {
    ascent: data.readInt16BE(hhea + 4) / em,
    descent: -data.readInt16BE(hhea + 6) / em,
    lineGap: data.readInt16BE(hhea + 8) / em,
    capHeight: data.readInt16BE(os2 + 88) / em,
  };
}

describe("displayLeadingFix", () => {
  test.each(["800ExtraBold/BigShoulders_800ExtraBold.ttf", "900Black/BigShoulders_900Black.ttf"])("uses the metrics of %s", (file) => {
    const metrics = fontMetrics(require.resolve(`@expo-google-fonts/big-shoulders/${file}`));
    expect(metrics.lineGap).toBe(0);
    expect(metrics.ascent).toBeCloseTo(DISPLAY_FACE_METRICS.ascent, 4);
    expect(metrics.descent).toBeCloseTo(DISPLAY_FACE_METRICS.descent, 4);
    expect(metrics.capHeight).toBeCloseTo(DISPLAY_FACE_METRICS.capHeight, 4);
  });

  test("does nothing on Android or when the line is at least the font's own height", () => {
    expect(displayLeadingFix("android", 116, 90)).toBeNull();
    expect(displayLeadingFix("ios", 20, 30)).toBeNull();
  });

  test("on iOS puts the baseline where Android puts it and keeps the layout height", () => {
    const { fontSize, lineHeight } = typography["display-hero"];
    const fix = displayLeadingFix("ios", fontSize, lineHeight);
    if (!fix) throw new Error("display-hero needs the fix");
    const { ascent, descent, capHeight } = DISPLAY_FACE_METRICS;
    const androidBaseline = ascent * fontSize - ((ascent + descent) * fontSize - lineHeight) / 2;
    // iOS draws the baseline one descent above the bottom of the content box, which starts below the top padding.
    const iosBaseline = fix.marginTop + fix.paddingTop + lineHeight - descent * fontSize;
    expect(iosBaseline).toBeCloseTo(androidBaseline, 5);
    expect(fix.marginTop + fix.paddingTop + lineHeight + fix.marginBottom).toBeCloseTo(lineHeight, 5);
    // The top of a digit stays inside the view, which now starts at -marginTop above the line.
    expect(androidBaseline - capHeight * fontSize).toBeGreaterThan(fix.marginTop);
  });
});
