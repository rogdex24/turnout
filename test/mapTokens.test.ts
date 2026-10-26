import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { readDesignFront } from "../src/utils/design.js";
import { mapCss } from "../src/web/map/css/index.js";
import { designTokensCss } from "../src/web/map/tokens.js";

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i;

const SOURCE = /\.(ts|tsx|css)$/;

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? sourceFiles(path.join(dir, entry.name)) : SOURCE.test(entry.name) ? [path.join(dir, entry.name)] : [],
    );
}

test("no hex color literal in src/web/map, src/web/ui, the map components or the server-rendered pages outside the generated block", () => {
  // src/web/map already contains src/web/map/components; both are named so a move cannot drop the check.
  const files = ["src/web/map", "src/web/ui", "src/web/map/components", "src/web/site"].flatMap(sourceFiles);
  expect(files.some((f) => f.endsWith("src/web/ui/styles.css"))).toBe(true);
  for (const file of files) {
    expect({ file, hex: HEX.exec(fs.readFileSync(file, "utf8"))?.[0] ?? null }).toEqual({ file, hex: null });
  }
  // The generated block is where hex values live, and it carries every color in DESIGN.md.
  const generated = designTokensCss();
  expect(generated).toContain("--color-primary: #1f6f5c");
  expect(generated).toContain("--color-map-dark: #0c0c0c");
  const rest = mapCss().replace(generated, "");
  expect(HEX.test(rest)).toBe(false);
});

test("dark mode is mapped once and covers every role with a dark twin", () => {
  const generated = designTokensCss();
  const front = readDesignFront();
  expect(front.components.pill?.height).toBe("36px");
  const darkTokens = [...generated.matchAll(/--color-([a-z-]+)-dark:/g)].map((m) => m[1]!);
  for (const name of darkTokens) {
    expect(generated).toContain(`--${name}: var(--color-${name}-dark);`);
  }
  expect(generated.match(/prefers-color-scheme: dark/g)?.length).toBe(1);
  expect(generated).toContain(':root[data-theme="dark"]');
});

test("the shadcn variables come from roles, light and dark, and Tailwind reads only those", () => {
  const generated = designTokensCss();
  for (const line of [
    "--background: var(--bg);",
    "--foreground: var(--ink);",
    "--card: var(--surface);",
    "--primary-foreground: var(--on-primary);",
    "--muted-foreground: var(--color-muted-foreground);",
    "--border: var(--line);",
    "--ring: var(--primary);",
    "--destructive: var(--danger);",
    "--radius: var(--rounded-card);",
  ]) {
    expect(generated).toContain(line);
  }
  // The muted text color flips with the theme like every other role.
  expect(generated).toContain("--muted-foreground: var(--color-muted-foreground-dark);");
  const tailwind = fs.readFileSync("src/web/ui/styles.css", "utf8");
  const mapped = [...tailwind.matchAll(/--color-([a-z-]+): var\(--([a-z-]+)\);/g)];
  expect(mapped.length).toBeGreaterThan(15);
  for (const [, , variable] of mapped) expect(generated).toContain(`--${variable}:`);
});

test("Inter is self-hosted: the page names its own font file and no font CDN", async () => {
  const { INTER_URL } = await import("../src/web/fonts.js");
  expect(generatedHasFace(designTokensCss(), INTER_URL)).toBe(true);
  expect(designTokensCss()).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  // The rupee sign has its own face, so a price never falls back to a system font.
  expect(designTokensCss()).toMatch(/inter-rupee\.[0-9a-f]+\.woff2\)[^}]*unicode-range: U\+20B9/);
  expect(readDesignFront().typography.body?.fontFamily).toStartWith('"Inter Variable"');
});

const generatedHasFace = (css: string, url: string) => css.includes('font-family: "Inter Variable"') && css.includes(`url(${url})`);

test("the category icon size and colour mixes in code are DESIGN.md's", async () => {
  const { LAYOUT } = await import("../src/web/map/layout.js");
  const { components, colors } = readDesignFront();
  expect(`${LAYOUT.categoryIcon.tile}px`).toBe(String(components["category-icon"]!.size));
  expect(components["category-icon-dark"]!.textColor).toBe("{colors.icon-lift}");
  expect(colors["icon-lift"]).toBe("#ffffff");
  const generated = designTokensCss();
  expect(generated).toContain("--icon-toward: var(--ink);");
  expect(generated).toContain("--icon-toward-pct: 30%;");
  expect(generated).toContain("--icon-toward: var(--color-icon-lift);");
  expect(generated).toContain("--icon-toward-pct: 20%;");
});

test("the image sizes in code are DESIGN.md's: the thumbnail token, and a 16:9 cover at the wide card's width (S8 item 11)", async () => {
  const { LAYOUT } = await import("../src/web/map/layout.js");
  const { components } = readDesignFront();
  expect(`${LAYOUT.image.thumb}px`).toBe(String(components["event-thumbnail"]!.size));
  expect(`${LAYOUT.image.coverWidth}px`).toBe(String(components["card-wide"]!.width));
  expect(LAYOUT.image.coverWidth / LAYOUT.image.coverHeight).toBeCloseTo(16 / 9, 2);
});

test("semantic links are not recoloured by the page's anchor reset: the reset has no specificity (S8 item 11)", () => {
  expect(mapCss()).toContain(":where(.map-page) a { color: inherit; }");
  expect(mapCss()).not.toMatch(/^\.map-page a \{/m);
});
