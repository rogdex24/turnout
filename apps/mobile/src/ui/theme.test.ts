import fs from "node:fs";
import path from "node:path";
import { radii, typography } from "@turnout/design-tokens";

/** src/theme.css is written by hand, so this pins its values to the generated tokens and to native.ts. */
const css = fs.readFileSync(path.join(__dirname, "..", "theme.css"), "utf8");

function declared(name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
}

describe("src/theme.css", () => {
  test.each(Object.entries(typography))("type token %s", (token, style) => {
    expect(declared(`--text-${token}`)).toBe(`${style.fontSize}px`);
    expect(declared(`--text-${token}--line-height`)).toBe(`${style.lineHeight}px`);
    const spacing = (style as { letterSpacing?: number }).letterSpacing;
    expect(declared(`--text-${token}--letter-spacing`)).toBe(spacing === undefined ? undefined : `${spacing}px`);
  });

  test.each(Object.entries(radii))("radius %s", (name, value) => {
    expect(declared(`--radius-${name}`)).toBe(`${value}px`);
  });

  test("font families match the names the expo-font plugin registers", () => {
    expect(declared("--font-sans")).toBe('"Inter"');
    expect(declared("--font-display")).toBe('"Big Shoulders Display"');
  });
});
