import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** S7: the listing and event pages are server-rendered React with the shared tokens, and run only the theme toggle's script. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

for (const path of ["/", "/c/comedy", "/e/e1"]) {
  test(`${path} loads with no console errors, no map bundle and Inter from our own origin`, async ({ page }) => {
    const problems = watch(page);
    const urls: string[] = [];
    page.on("request", (r) => urls.push(new URL(r.url()).pathname));
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"Inter Variable"/);
    expect(await page.evaluate(() => document.fonts.check('16px "Inter Variable"'))).toBe(true);
    expect(urls.filter((u) => /^\/assets\/(map|chunk|maplibre)/.test(u))).toEqual([]);
    expect(await page.evaluate(() => [...document.scripts].filter((s) => s.src).length)).toBe(0);
    expect(problems).toEqual([]);
  });
}

test("the header is the map's: brand, List / Map and a theme button that cycles auto, light, dark", async ({ page }) => {
  await page.goto("/");
  const head = page.locator(".site-head");
  await expect(head.getByRole("link", { name: "Hyd Tonight" })).toBeVisible();
  await expect(head.getByRole("navigation", { name: "View" }).getByRole("link", { name: "List" })).toHaveAttribute("aria-current", "page");
  const toggle = page.locator("#theme-toggle");
  await expect(toggle).toBeVisible();
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", /.*/);
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(toggle).toHaveAttribute("aria-label", "Theme: Light. Switch theme");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).not.toBe("rgb(244, 245, 242)"); // the dark page color, from the same token as the map
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark"); // stored, applied before paint
  await toggle.click();
  await expect(html).not.toHaveAttribute("data-theme", /.*/);
  // Same size and shape as the map's theme button.
  const box = (await toggle.boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([36, 36]);
});

test("filters round-trip: listing to map and back keeps category, area and free", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Event type").selectOption("comedy");
  await page.getByLabel("Free only").check();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/\?(?=.*category=comedy)(?=.*free=true)/); // the plain GET form also sends its empty fields

  await page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "Map" }).click();
  await expect(page).toHaveURL(/\/map\?category=comedy&free=1$/);
  await expect(page.locator(".mk .tile").first()).toBeVisible();
  // The map applied them: Free is on, the Filters pill is marked, and every pin is a comedy venue.
  await expect(page.getByRole("link", { name: "Free", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: /^Filters/ })).toContainText("·");
  for (const label of await page.locator(".mk .tile").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!)))
    expect(label).toContain("Comedy");

  // Change a filter on the map; the List link follows it live.
  await page.getByRole("link", { name: "Free", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "List" })).toHaveAttribute(
    "href",
    "/?category=comedy",
  );
  await page.getByRole("link", { name: "Free", exact: true }).click();
  await page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "List" }).click();
  await expect(page).toHaveURL(/\/\?category=comedy&free=true$/);
  await expect(page.getByLabel("Event type")).toHaveValue("comedy");
  await expect(page.getByLabel("Free only")).toBeChecked();
});

test("the event page offers the source, the calendar and the map, and the map opens on that event", async ({ page }) => {
  await page.goto("/e/e1");
  await expect(page.getByRole("heading", { level: 1, name: "Jazz night" })).toBeVisible();
  await expect(page.getByRole("link", { name: /View source/ })).toHaveAttribute("href", "https://example.com/e");
  await expect(page.getByRole("link", { name: "Add to calendar" })).toHaveAttribute("href", "/e/e1.ics");
  await page.getByRole("link", { name: "Show on the map" }).click();
  await expect(page).toHaveURL(/\/map\?event=e1$/);
  await expect(page.locator("li.row.open")).toBeVisible();
});

test("every control on the listing has a visible focus ring", async ({ page }) => {
  await page.goto("/");
  const seen = new Set<string>();
  for (let i = 0; i < 24; i += 1) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      // A date field's calendar button is a tab stop of the browser's own; the input does not match :focus-visible there.
      if (!el || el === document.body || !el.matches(":focus-visible")) return null;
      const cs = getComputedStyle(el);
      return {
        name: `${el.tagName} ${el.getAttribute("aria-label") ?? el.getAttribute("name") ?? el.textContent?.trim().slice(0, 20)}`,
        style: cs.outlineStyle,
        width: parseFloat(cs.outlineWidth),
      };
    });
    if (!r) continue;
    seen.add(r.name);
    expect(r, `focus ring on ${r.name}`).toMatchObject({ style: "solid", width: 2 });
  }
  expect(seen.size).toBeGreaterThan(8);
});

test("listing times are tabular (S8 item 11)", async ({ page }) => {
  await page.goto("/");
  expect(
    await page
      .locator(".card .m-date")
      .first()
      .evaluate((el) => getComputedStyle(el).fontVariantNumeric),
  ).toContain("tabular-nums");
  expect(
    await page
      .locator(".card .meta")
      .first()
      .evaluate((el) => getComputedStyle(el).fontVariantNumeric),
  ).toContain("tabular-nums");
});

/** The colour a category glyph computes to, as rgb channels 0 to 255 (a color-mix may compute as color(srgb ...) with 0 to 1). */
export const glyphRgb = (el: Element): number[] => {
  const css = getComputedStyle(el).color;
  const v = css
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number);
  return css.startsWith("color(") ? v.map((n) => n * 255) : v;
};

test.describe("event page icons", () => {
  test("the music Category line draws the sprite icon, tinted toward ink in light mode", async ({ page }) => {
    await page.goto("/e/e1"); // Jazz night, music
    const icon = page.locator("dd svg.cat-icon use");
    await expect(icon).toHaveAttribute("href", /\/assets\/icons\/categories\.[0-9a-f]+\.svg#music$/);
    const [r, g, b] = await page.locator("dd svg.cat-icon").evaluate(glyphRgb);
    // tint-music #4f7cff mixed with ink #1d2327 at 30%: still blue-led, darker than the tint.
    expect(b!).toBeGreaterThan(r!);
    expect(b!).toBeLessThan(0xff * 0.85);
    expect(g!).toBeLessThan(0x7c);
  });
  test.describe("dark", () => {
    test.use({ colorScheme: "dark" });
    test("the glyph is lifted toward white", async ({ page }) => {
      await page.goto("/e/e1");
      const [r, g, b] = await page.locator("dd svg.cat-icon").evaluate(glyphRgb);
      // #4f7cff at 80% with white at 20% is (114, 150, 255).
      expect(Math.abs(r! - 114)).toBeLessThan(3);
      expect(Math.abs(g! - 150)).toBeLessThan(3);
      expect(b!).toBeGreaterThan(250);
    });
  });
});

test("'Back to listing' and 'Details'-style links compute to the primary color", async ({ page }) => {
  await page.goto("/e/e1");
  const [link, primary] = await page.evaluate(() => {
    const probe = document.createElement("i");
    probe.style.color = "var(--primary)";
    document.body.append(probe);
    const p = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(document.querySelector("a.link")!).color, p];
  });
  expect(link).toBe(primary);
});
