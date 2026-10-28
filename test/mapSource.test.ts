import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

// String-built DOM, dangerouslySetInnerHTML outside src/web/ui/rawBlock.tsx and direct history writes on /map are lint
// errors (biome.json, lint/*.grit). This file keeps what a linter cannot see: rules inside CSS written as template
// strings, and replaced code that must stay deleted.

const files = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|tsx|css)$/.test(e.name) ? [path.join(dir, e.name)] : []));
const web = files("src/web");

test("the lint guards for the UI are configured", () => {
  const config = JSON.parse(fs.readFileSync("biome.json", "utf8"));
  const plugins = config.plugins.map((p: { path: string }) => p.path);
  expect(plugins).toEqual(["./lint/no-html-strings.grit", "./lint/no-color-literals.grit", "./lint/no-history-writes.grit"]);
  expect(config.linter.rules.security.noDangerouslySetInnerHtml).toBe("error");
  expect(config.linter.rules.correctness.useHookAtTopLevel).toBe("error");
});

test("no !important and no transition on every property under src/web (S6.4)", () => {
  for (const file of web) {
    const text = fs.readFileSync(file, "utf8");
    expect({ file, important: text.includes("!important") }).toEqual({ file, important: false });
    expect({ file, hit: /transition(?:-property)?\s*:\s*all\b|\btransition-all\b/.exec(text)?.[0] ?? null }).toEqual({ file, hit: null });
  }
});

test("the replaced renderers and the old URL codec are gone (S3.2, S4.1)", () => {
  for (const gone of ["src/web/map/render.ts", "src/web/map/page.ts", "src/web/map/client/map.ts", "src/web/map/icons.ts"]) {
    expect({ gone, exists: fs.existsSync(gone) }).toEqual({ gone, exists: false });
  }
  for (const file of web) {
    const text = fs.readFileSync(file, "utf8");
    expect({ file, hit: /\b(parseFilters|toQuery|withEventVenue)\b/.exec(text)?.[0] ?? null }).toEqual({ file, hit: null });
  }
});

test("the one raw-markup helper takes a fixed script or style block only (R3)", () => {
  expect(fs.readFileSync("src/web/ui/rawBlock.tsx", "utf8")).toContain('as: "script" | "style"');
});

test("the theme button's icons are in the markup, and its script only toggles them (S8 item 7)", () => {
  const text = fs.readFileSync("src/web/theme.ts", "utf8");
  expect(text).not.toContain("ICONS");
  expect(text).toContain('toggleAttribute("hidden"');
});
