import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { THEME_BOOT_MARKER, withThemeBoot } from "../src/admin/themeBoot.js";
import { readDesignFront } from "../src/utils/design.js";
import { bootScript, nextPreference, themeProtocol } from "../src/utils/theme.js";
import { faviconResponse } from "../src/web/brand.js";
import { INTER_RUPEE_URL, INTER_URL } from "../src/web/fonts.js";
import { siteResponse } from "../src/web/index.js";
import { THEME_BOOT } from "../src/web/theme.js";
import { memoryDb } from "./helpers.js";

/** A browser-shaped stub: <html>, localStorage and matchMedia, enough for the protocol. */
function browser({ stored = null as string | null, osDark = false, blocked = false } = {}) {
  const classes = new Set<string>();
  const root = {
    dataset: {} as Record<string, string | undefined>,
    style: { colorScheme: "" },
    classList: { toggle: (name: string, force: boolean) => void (force ? classes.add(name) : classes.delete(name)) },
  };
  const store = new Map(stored ? [["theme", stored]] : []);
  const guard = <T>(fn: () => T): T => {
    if (blocked) throw new Error("storage blocked");
    return fn();
  };
  Object.assign(globalThis, {
    document: { documentElement: root },
    localStorage: {
      getItem: (k: string) => guard(() => store.get(k) ?? null),
      setItem: (k: string, v: string) => guard(() => void store.set(k, v)),
      removeItem: (k: string) => guard(() => void store.delete(k)),
    },
    matchMedia: () => ({ matches: osDark }),
  });
  return { root, classes, store };
}
afterEach(() => {
  for (const key of ["document", "localStorage", "matchMedia"]) delete (globalThis as Record<string, unknown>)[key];
});

test("the protocol writes data-theme for the public site and .dark for the admin from one stored value", () => {
  const web = browser({ stored: "dark" });
  expect(themeProtocol("attribute")).toBe("dark");
  expect(web.root.dataset.theme).toBe("dark");
  expect(themeProtocol("attribute", "auto")).toBe("auto");
  expect(web.root.dataset.theme).toBeUndefined();
  expect(web.store.has("theme")).toBe(false);

  const admin = browser({ stored: "dark" });
  expect(themeProtocol("class")).toBe("dark");
  expect(admin.classes.has("dark")).toBe(true);
  expect(admin.root.style.colorScheme).toBe("dark");
  themeProtocol("class", "light");
  expect(admin.classes.has("dark")).toBe(false);
  expect(admin.store.get("theme")).toBe("light");
});

test("auto follows the OS in class mode, a stored light choice beats a dark OS, and blocked storage still applies the choice", () => {
  const auto = browser({ osDark: true });
  expect(themeProtocol("class")).toBe("auto");
  expect(auto.classes.has("dark")).toBe(true);
  const light = browser({ osDark: true, stored: "light" });
  themeProtocol("class");
  expect(light.classes.has("dark")).toBe(false);
  const blocked = browser({ blocked: true });
  expect(themeProtocol("attribute", "dark")).toBe("dark");
  expect(blocked.root.dataset.theme).toBe("dark");
  expect(nextPreference("auto")).toBe("light");
  expect(nextPreference("dark")).toBe("auto");
});

test("the inline boot script the public pages embed behaves like the function it came from", () => {
  const page = browser({ stored: "light" });
  new Function(bootScript("attribute"))();
  expect(page.root.dataset.theme).toBe("light");
  expect(THEME_BOOT).toBe(`<script>${bootScript("attribute")}</script>`);
});

test("only utils/theme.ts touches the theme preference (the admin's pre-paint script is generated from it)", () => {
  const files = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|tsx|html)$/.test(e.name) ? [path.join(dir, e.name)] : []));
  const users = files("src").filter(
    (f) => /["']theme["']/.test(fs.readFileSync(f, "utf8")) && /localStorage/.test(fs.readFileSync(f, "utf8")),
  );
  expect(users.sort()).toEqual(["src/utils/theme.ts"]);
});

test("the favicon colors are DESIGN.md's ink and primary-dark, the same source the admin uses", async () => {
  const { ink, "primary-dark": moon } = readDesignFront().colors;
  const svg = await faviconResponse().text();
  expect(svg).toContain(`fill="${ink}"`);
  expect(svg).toContain(`fill="${moon}"`);
  expect(fs.readFileSync("src/web/brand.ts", "utf8")).not.toMatch(/#[0-9a-f]{6}/i);
  expect(fs.readFileSync("src/admin/ui/index.html", "utf8")).not.toContain("data:image/svg+xml");
});

test("/map links the self-hosted Inter file, which is served with a year-long immutable cache", async () => {
  const db = memoryDb();
  const html = await siteResponse(db, new Request("http://localhost/map")).text();
  expect(html).toContain(`href="${INTER_URL}"`);
  expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  const font = siteResponse(db, new Request(`http://localhost${INTER_URL}`));
  expect(font.status).toBe(200);
  expect(font.headers.get("content-type")).toBe("font/woff2");
  expect(font.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  expect((await font.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
  const rupee = siteResponse(db, new Request(`http://localhost${INTER_RUPEE_URL}`));
  expect(rupee.status).toBe(200);
  const size = (await rupee.arrayBuffer()).byteLength;
  expect(size).toBeGreaterThan(500);
  expect(size).toBeLessThan(5_000); // a rupee-only subset; the whole latin-ext file is 85 KB
  expect(siteResponse(db, new Request("http://localhost/assets/fonts/inter-latin.0000000000.woff2")).status).toBe(404);
  db.close();
});

test("the admin has no handwritten pre-paint logic: its shell names a marker and the served script is the shared protocol (S8 item 9)", () => {
  const html = fs.readFileSync("src/admin/ui/index.html", "utf8");
  expect(html).toContain(THEME_BOOT_MARKER);
  expect(html).not.toContain("localStorage");
  expect(html).not.toContain("matchMedia");
  const served = withThemeBoot(html);
  expect(served).not.toContain('theme-boot" content');
  expect(served).toContain(`<script>${bootScript("class")}</script>`);
  expect(served.indexOf(bootScript("class"))).toBeLessThan(served.indexOf('type="module"')); // it runs before the bundles
});

test("the served pre-paint script and the shared protocol give the same result for every stored value, OS setting and blocked storage", () => {
  const served = withThemeBoot(fs.readFileSync("src/admin/ui/index.html", "utf8"));
  const inline = [...served.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).find((text) => text.includes("localStorage"))!;
  expect(inline).toBeDefined();
  for (const blocked of [false, true]) {
    for (const stored of [null, "light", "dark", "nonsense"]) {
      for (const osDark of [false, true]) {
        const viaScript = browser({ stored, osDark, blocked });
        new Function(inline)();
        const script = { dark: viaScript.classes.has("dark"), scheme: viaScript.root.style.colorScheme };
        const viaProtocol = browser({ stored, osDark, blocked });
        themeProtocol("class");
        expect({ blocked, stored, osDark, ...script }).toEqual({
          blocked,
          stored,
          osDark,
          dark: viaProtocol.classes.has("dark"),
          scheme: viaProtocol.root.style.colorScheme,
        });
      }
    }
  }
});
