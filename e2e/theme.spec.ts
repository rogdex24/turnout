import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const stored = (page: Page) => page.evaluate(() => localStorage.getItem("theme"));
/** Mean RGB (0 to 255) of the first opaque background from the page body's first child up: the page color the reader sees. */
const lightnessOf = (page: Page) =>
  page.evaluate(() => {
    const px = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    for (let el: Element | null = document.body.firstElementChild ?? document.body; el; el = el.parentElement) {
      px.clearRect(0, 0, 1, 1);
      px.fillStyle = getComputedStyle(el).backgroundColor; // normalises oklch() and friends to pixels
      px.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = px.getImageData(0, 0, 1, 1).data;
      if (a! > 0) return (r! + g! + b!) / 3;
    }
    return 255;
  });

test("the public theme toggle cycles auto, light, dark and writes data-theme and localStorage", async ({ page }) => {
  await page.goto("/map");
  const toggle = page.locator("#theme-toggle");
  await expect(toggle).toBeVisible();
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", /.*/);
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "light");
  expect(await stored(page)).toBe("light");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await stored(page)).toBe("dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await lightnessOf(page)).toBeLessThan(60);
  await toggle.click();
  await expect(html).not.toHaveAttribute("data-theme", /.*/);
  expect(await stored(page)).toBeNull();
});

test("/map text is Inter from our own origin, with no font CDN request", async ({ page }) => {
  const hosts = new Set<string>();
  page.on("request", (request) => hosts.add(new URL(request.url()).host));
  const fonts: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/assets/fonts/")) fonts.push(`${response.status()} ${response.headers()["cache-control"]}`);
  });
  await page.goto("/map");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"Inter Variable"/);
  expect(await page.evaluate(() => document.fonts.check('16px "Inter Variable"'))).toBe(true);
  // Prices print the rupee sign, so its face is fetched too; both files come from /assets/fonts/.
  expect(await page.evaluate(async () => (await document.fonts.load('16px "Inter Variable"', "\u20B9")).length)).toBeGreaterThan(0);
  expect(fonts.sort()).toEqual(["200 public, max-age=31536000, immutable", "200 public, max-age=31536000, immutable"]);
  expect([...hosts].filter((h) => /fonts\.(googleapis|gstatic)\.com/.test(h))).toEqual([]);
});

test.describe("admin", () => {
  test("the admin shell renders in light and in dark through the shared protocol", async ({ page, adminUrl }) => {
    // Seed once: an init script runs again on reload and would undo the choice made in the test.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem("theme", "light");
      }
    });
    await page.goto(adminUrl);
    const html = page.locator("html");
    await expect(page.getByRole("button", { name: /Theme: Light/ })).toBeVisible();
    await expect(html).not.toHaveClass(/dark/);
    expect(await lightnessOf(page)).toBeGreaterThan(200);

    await page.getByRole("button", { name: /Theme: Light/ }).click();
    await expect(page.getByRole("button", { name: /Theme: Dark/ })).toBeVisible();
    await expect(html).toHaveClass(/dark/);
    expect(await stored(page)).toBe("dark");
    expect(await lightnessOf(page)).toBeLessThan(60);

    await page.reload();
    await expect(html).toHaveClass(/dark/);
    await page.getByRole("button", { name: /Theme: Dark/ }).click();
    await expect(page.getByRole("button", { name: /Theme: Auto/ })).toBeVisible();
    expect(await stored(page)).toBeNull();
  });

  test("a stored dark choice is applied before any script bundle runs, so there is no light flash", async ({ page, adminUrl }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.route("**/*.js", (route) => route.abort()); // the bundle never loads: only the inline script can have run
    await page.goto(adminUrl);
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
  });

  test("the admin favicon is the shared mark", async ({ page, adminUrl }) => {
    await page.goto(adminUrl);
    const href = await page.locator('link[rel="icon"]').getAttribute("href");
    expect(href).toBe("/favicon.svg");
    const svg = await (await page.request.get(`${adminUrl}/favicon.svg`)).text();
    const site = await (await page.request.get("/favicon.svg")).text();
    expect(svg).toBe(site);
  });
});
