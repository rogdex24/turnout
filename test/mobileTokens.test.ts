import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { displayFaces, fontScaling, loopPlays, pressed, springs } from "../packages/design-tokens/native.js";
import { colors, typography } from "../packages/design-tokens/tokens.generated.js";
import { appColors, renderThemeCss, renderTokensTs } from "../scripts/build-mobile-tokens.js";
import { readDesignFront } from "../src/utils/design.js";
import { designTokensCss } from "../src/web/map/tokens.js";

const front = readDesignFront();
const PACKAGE = "packages/design-tokens/";

type Rgb = [number, number, number];

/** `#rrggbb` or `#rrggbbaa` laid over an opaque background, as 0 to 255 channels. */
function over(hex: string, base: Rgb = [0, 0, 0]): Rgb {
  const channel = (i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const alpha = hex.length === 9 ? channel(3) / 255 : 1;
  return [0, 1, 2].map((i) => Math.round(channel(i) * alpha + base[i]! * (1 - alpha))) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio of a foreground over a background; both may carry alpha, the background over `under`. */
function contrast(fg: string, bg: string, under?: string): number {
  const base = under ? over(under) : ([0, 0, 0] as Rgb);
  const back = over(bg, base);
  const a = luminance(over(fg, back));
  const b = luminance(back);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("generated files", () => {
  test("tokens.generated.ts and theme.generated.css match DESIGN.md (run `bun run tokens:mobile`)", () => {
    expect(fs.readFileSync(`${PACKAGE}tokens.generated.ts`, "utf8")).toBe(renderTokensTs(front));
    expect(fs.readFileSync(`${PACKAGE}theme.generated.css`, "utf8")).toBe(renderThemeCss(front));
  });

  test("every app color has a dark twin and both themes carry the same roles", () => {
    const { light, dark } = appColors(front);
    expect(Object.keys(dark)).toEqual(Object.keys(light));
    for (const role of ["bg", "surface", "surface-raised", "line", "outline", "ink", "muted", "signal", "signal-soft"]) {
      expect(light).toHaveProperty([role]);
    }
    for (const role of ["primary", "on-primary", "scrim", "on-photo", "marquee", "pressed", "skeleton"]) {
      expect(light).toHaveProperty([role]);
    }
    expect(Object.keys(colors.light)).toEqual(Object.keys(colors.dark));
  });

  test("the web and /map roles are untouched and the /map CSS carries no app token", () => {
    expect(front.colors.primary).toBe("#1f6f5c");
    expect(front.colors["primary-dark"]).toBe("#6fcfb0");
    const css = designTokensCss();
    expect(css).not.toMatch(/app-|--font-display|--font-title-large/);
  });

  test("the app has no red: no app component uses the danger roles", () => {
    for (const [name, component] of Object.entries(front.components)) {
      if (!name.startsWith("app-")) continue;
      expect(JSON.stringify(component)).not.toContain("danger");
    }
  });
});

describe("app contrast (DESIGN.md, Mobile app)", () => {
  const themes = { light: appColors(front).light, dark: appColors(front).dark } as const;
  const surfaces = ["app-bg", "app-surface", "app-surface-raised"] as const;
  const role = (theme: "light" | "dark", name: string) => themes[theme][name.replace(/^app-/, "")]!;

  for (const theme of ["light", "dark"] as const) {
    describe(theme, () => {
      test("ink is 4.5:1 on every surface", () => {
        for (const surface of surfaces) expect(contrast(role(theme, "app-ink"), role(theme, surface))).toBeGreaterThanOrEqual(4.5);
      });

      test("muted is 4.5:1 on every surface", () => {
        for (const surface of surfaces) expect(contrast(role(theme, "app-muted"), role(theme, surface))).toBeGreaterThanOrEqual(4.5);
      });

      test("the signal is 4.5:1 on every surface, and 5.1:1 in light", () => {
        const floor = theme === "light" ? 5.1 : 4.5;
        for (const surface of surfaces) expect(contrast(role(theme, "app-signal"), role(theme, surface))).toBeGreaterThanOrEqual(floor);
      });

      test("the signal on its soft chip is 4.5:1 over bg and surface, and 5.1:1 in light over bg", () => {
        const onBg = contrast(role(theme, "app-signal"), role(theme, "app-signal-soft"), role(theme, "app-bg"));
        const onSurface = contrast(role(theme, "app-signal"), role(theme, "app-signal-soft"), role(theme, "app-surface"));
        expect(onBg).toBeGreaterThanOrEqual(theme === "light" ? 5.1 : 4.5);
        expect(onSurface).toBeGreaterThanOrEqual(4.5);
      });

      test("the primary button label is 4.5:1 on the button", () => {
        expect(contrast(role(theme, "app-on-primary"), role(theme, "app-primary"))).toBeGreaterThanOrEqual(4.5);
      });

      test("photo text is 4.5:1 on every placeholder poster tone, and the marquee text on its band", () => {
        for (const tone of ["app-poster-comedy", "app-poster-music", "app-poster-theatre"]) {
          expect(contrast(role(theme, "app-on-photo"), role(theme, tone))).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(role("dark", "app-ink"), role(theme, "app-marquee"))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(role("dark", "app-muted"), role(theme, "app-marquee"))).toBeGreaterThanOrEqual(4.5);
      });

      test("control borders and the signal dot are 3:1 on the page", () => {
        expect(contrast(role(theme, "app-outline"), role(theme, "app-bg"))).toBeGreaterThanOrEqual(3);
        expect(contrast(role(theme, "app-signal"), role(theme, "app-bg"))).toBeGreaterThanOrEqual(3);
        expect(contrast(role(theme, "app-primary"), role(theme, "app-bg"))).toBeGreaterThanOrEqual(3);
      });
    });
  }

  test("the contrast helper agrees with the known ratio of black on white", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });
});

describe("type scale", () => {
  test("DESIGN.md has the new Inter and display-face styles", () => {
    const t = front.typography;
    expect([t.display?.fontSize, t.display?.lineHeight, t.display?.fontWeight]).toEqual(["28px", "34px", 600]);
    expect([t["title-large"]?.fontSize, t["title-large"]?.lineHeight, t["title-large"]?.fontWeight]).toEqual(["22px", "28px", 600]);
    expect(t["display-hero"]?.fontSize).toBe("116px");
    expect(t["display-band"]?.fontSize).toBe("28px");
    expect(t["display-hero"]?.fontFamily).toStartWith('"Big Shoulders Display"');
    // The web scale is unchanged.
    expect([t.title?.fontSize, t.body?.fontSize, t.control?.fontSize]).toEqual(["18px", "16px", "14px"]);
  });

  test("the generated app scale takes the app's title, body and control sizes", () => {
    expect([typography.title.fontSize, typography.title.lineHeight]).toEqual([17, 24]);
    expect([typography.body.fontSize, typography.body.lineHeight]).toEqual([15, 22]);
    expect([typography.control.fontSize, typography.control.lineHeight]).toEqual([15, 20]);
    expect([typography.meta.fontSize, typography.label.fontSize]).toEqual([13, 12]);
    expect(typography["display-hero"].fontSize).toBe(116);
    expect(typography["display-band"].fontSize).toBe(28);
  });

  test("the display-face ranges are in native.ts", () => {
    expect([displayFaces["display-poster"].minFontSize, displayFaces["display-poster"].maxFontSize]).toEqual([30, 70]);
    expect([displayFaces["display-numeral"].minFontSize, displayFaces["display-numeral"].maxFontSize]).toEqual([24, 36]);
  });
});

describe("native.ts", () => {
  test("font scaling caps are the documented ones (F4)", () => {
    expect(fontScaling.display).toEqual({ allowFontScaling: true, maxFontSizeMultiplier: 1.6 });
    expect(fontScaling["title-large"]).toEqual({ allowFontScaling: true, maxFontSizeMultiplier: 1.6 });
    expect(fontScaling.badge).toEqual({ allowFontScaling: true, maxFontSizeMultiplier: 1.3 });
    expect(fontScaling.label).toEqual({ allowFontScaling: true, maxFontSizeMultiplier: 1.3 });
    for (const name of ["title", "body", "control", "meta"] as const) expect(fontScaling[name]).toEqual({ allowFontScaling: true });
    for (const name of ["display-hero", "display-band", "display-poster", "display-numeral"] as const) {
      expect(fontScaling[name]).toEqual({ allowFontScaling: false });
    }
  });

  test("every generated type style has a scaling rule, and no rule is for a missing style", () => {
    const styles = Object.keys(typography);
    for (const name of styles) expect(fontScaling).toHaveProperty([name]);
    expect(Object.keys(fontScaling).sort()).toEqual([...styles, ...Object.keys(displayFaces)].sort());
  });

  test("the springs and the pressed feedback are the documented ones (F5)", () => {
    expect(Object.keys(springs)).toEqual(["snappy", "gentle", "reveal"]);
    expect(pressed.opacity).toBe(0.85);
    expect(pressed.scale).toBe(0.97);
    expect(pressed.durationMs).toBeLessThanOrEqual(100);
    expect(pressed.opacityFor).toEqual(["row", "card", "link"]);
    expect(pressed.scaleFor).toEqual(["button", "chip", "iconButton"]);
    for (const plays of Object.values(loopPlays)) expect(plays).toBeLessThanOrEqual(3);
  });
});

test("the package is data only: no React, no React Native, no runtime import", () => {
  const manifest = JSON.parse(fs.readFileSync(`${PACKAGE}package.json`, "utf8")) as Record<string, unknown>;
  expect(manifest.name).toBe("@turnout/design-tokens");
  expect(manifest.dependencies).toBeUndefined();
  for (const file of ["index.ts", "native.ts", "tokens.generated.ts"]) {
    const source = fs.readFileSync(`${PACKAGE}${file}`, "utf8");
    expect(source).not.toMatch(/from "(react|react-native|expo|node:|bun:)/);
    // Only `export ... from` and `import type` are allowed.
    for (const line of source.split("\n").filter((l) => /^import /.test(l))) expect(line).toStartWith("import type");
  }
});
