/**
 * Builds the mobile design tokens from DESIGN.md: `packages/design-tokens/tokens.generated.ts` (colors and type
 * styles as plain data) and `theme.generated.css` (the light and dark CSS variables for the app's Tailwind theme).
 * `bun run tokens:mobile` writes both; test/mobileTokens.test.ts fails if they drift from DESIGN.md.
 * Spacing, radii, motion and font scaling are hand-written in packages/design-tokens/native.ts.
 */
import fs from "node:fs";
import { type DesignFront, readDesignFront } from "../src/utils/design.js";

const OUT = new URL("../packages/design-tokens/", import.meta.url);

/** The type styles the app uses. A style with an `app-<name>` twin in DESIGN.md takes that value (the app's title is 17, the page's is 18). */
export const MOBILE_TYPE = ["display", "title-large", "title", "body", "control", "meta", "label", "badge", "display-hero", "display-band"];

const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** `app-<role>` colors that have an `app-<role>-dark` twin, as `{ <role>: hex }` for each theme. */
export function appColors(front: DesignFront): { light: Record<string, string>; dark: Record<string, string> } {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const [name, value] of Object.entries(front.colors)) {
    if (!name.startsWith("app-") || name.endsWith("-dark")) continue;
    const twin = front.colors[`${name}-dark`];
    if (twin === undefined) throw new Error(`${name} has no ${name}-dark twin in DESIGN.md`);
    const role = name.slice(4);
    light[role] = value;
    dark[role] = twin;
  }
  return { light, dark };
}

type Style = DesignFront["typography"][string];

/** React Native wants one family name and numbers: "Inter Variable" stack to "Inter", "0.06em" to px. */
function nativeStyle(style: Style): string[] {
  const family = /^"?([^",]+?)(?: Variable)?"?(?:,|$)/.exec(style.fontFamily.trim())?.[1];
  if (!family) throw new Error(`cannot read the font family in ${style.fontFamily}`);
  const size = Number.parseFloat(style.fontSize);
  const lines = [
    `fontFamily: ${JSON.stringify(family)},`,
    `fontSize: ${size},`,
    `lineHeight: ${Number.parseFloat(style.lineHeight)},`,
    `fontWeight: ${JSON.stringify(String(style.fontWeight))},`,
  ];
  if (style.letterSpacing !== undefined) {
    const value = Number.parseFloat(style.letterSpacing);
    const px = style.letterSpacing.endsWith("em") ? Math.round(value * size * 100) / 100 : value;
    lines.push(`letterSpacing: ${px},`);
  }
  if (style.fontFeature?.includes("tnum")) lines.push(`fontVariant: ["tabular-nums"],`);
  return lines;
}

const HEADER = "Generated from DESIGN.md by scripts/build-mobile-tokens.ts (bun run tokens:mobile): do not edit.";

export function renderTokensTs(front: DesignFront = readDesignFront()): string {
  const { light, dark } = appColors(front);
  const theme = (colors: Record<string, string>) =>
    Object.entries(colors)
      .map(([role, hex]) => `    ${camel(role)}: ${JSON.stringify(hex)},`)
      .join("\n");
  const styles = MOBILE_TYPE.map((name) => {
    const style = front.typography[`app-${name}`] ?? front.typography[name];
    if (!style) throw new Error(`DESIGN.md has no typography.${name}`);
    const key = /^[a-z]+$/.test(name) ? name : JSON.stringify(name);
    return `  ${key}: {\n${nativeStyle(style)
      .map((line) => `    ${line}`)
      .join("\n")}\n  },`;
  });
  return `/** ${HEADER} */

export const colors = {
  light: {
${theme(light)}
  },
  dark: {
${theme(dark)}
  },
} as const;

export const typography = {
${styles.join("\n")}
} as const;

export type ColorRole = keyof typeof colors.light;
export type TypographyToken = keyof typeof typography;
`;
}

export function renderThemeCss(front: DesignFront = readDesignFront()): string {
  const { light, dark } = appColors(front);
  const vars = (colors: Record<string, string>) =>
    Object.entries(colors)
      .map(([role, hex]) => `      --color-${role}: ${hex};`)
      .join("\n");
  return `/* ${HEADER} */
@layer theme {
  :root {
    @variant light {
${vars(light)}
    }

    @variant dark {
${vars(dark)}
    }
  }
}
`;
}

if (import.meta.main) {
  fs.writeFileSync(new URL("tokens.generated.ts", OUT), renderTokensTs());
  fs.writeFileSync(new URL("theme.generated.css", OUT), renderThemeCss());
  console.log("wrote packages/design-tokens/tokens.generated.ts and theme.generated.css");
}
