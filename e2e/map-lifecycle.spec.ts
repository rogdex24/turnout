import type { Page } from "@playwright/test";
import { expect, STYLE, test } from "./fixtures";

async function openMap(page: Page, path = "/map") {
  await page.goto(path);
  await expect(page.locator(".mk .tile").first()).toBeVisible();
}
const basemap = (page: Page) => page.locator(".map-canvas").getAttribute("data-basemap");
/** The pin of a venue: its tile is named "<title> at <venue>, <category>, <n> events". */
const pin = (page: Page, venue: string) => page.locator(".mk .tile", { has: page.locator(".lv", { hasText: new RegExp(`^${venue}$`) }) });
/** Where the map is looking, read off one pin that stays in view. */
const where = async (page: Page, venue = "Near Hall") => {
  const b = (await pin(page, venue).boundingBox())!;
  return [Math.round(b.x), Math.round(b.y)];
};

test.describe("theme switching (S5.1)", () => {
  test("only the newest theme request is applied, even when an older one answers last", async ({ page }) => {
    // The dark style is slow. Ask for dark, then change your mind back to light before it arrives.
    await page.route("https://tiles.openfreemap.org/styles/dark", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ json: STYLE.dark });
    });
    await openMap(page);
    expect(await basemap(page)).toBe("light");
    const toggle = page.locator("#theme-toggle");
    await toggle.click(); // light
    await toggle.click(); // dark: the slow request starts
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await toggle.click(); // auto, which is light here: the dark request is no longer wanted
    await page.waitForTimeout(2500); // the dark answer has arrived by now
    expect(await basemap(page)).toBe("light");
  });

  test("a basemap that fails to load for a new theme leaves the one on screen", async ({ page }) => {
    await page.route("https://tiles.openfreemap.org/styles/dark", (route) => route.abort());
    await openMap(page);
    const toggle = page.locator("#theme-toggle");
    await toggle.click(); // light
    await toggle.click(); // dark
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.waitForTimeout(800);
    expect(await basemap(page)).toBe("light");
    await expect(page.getByText("The map could not load")).toHaveCount(0);
    await expect(page.locator(".mk .tile").first()).toBeVisible();
  });

  test("a theme change that loads applies the new basemap", async ({ page }) => {
    await openMap(page);
    const toggle = page.locator("#theme-toggle");
    await toggle.click();
    await toggle.click();
    await expect.poll(() => basemap(page)).toBe("dark");
  });
});

test("a pin names its next event and changes in place when the venue's events change (S5.2)", async ({ page }) => {
  await openMap(page);
  const near = pin(page, "Near Hall");
  await expect(near.locator(".lt")).toHaveText("Jazz night");
  await expect(near).toHaveAttribute("aria-label", "Jazz night at Near Hall, Music, 2 events");
  // Narrow the search to the venue's other event: the same pin now names that one (no stale label).
  await page.getByRole("searchbox", { name: "Search events" }).fill("open mic");
  await page.keyboard.press("Enter");
  await expect(near.locator(".lt")).toHaveText("Open mic");
  await expect(near).toHaveAttribute("aria-label", "Open mic at Near Hall, Comedy, 1 event");
  await expect(near.locator(".badge")).toHaveCount(0);
});

test("overlapping labels are hidden with an attribute, never an inline style, and hovering shows one again (S5.3)", async ({ page }) => {
  await openMap(page);
  // Open one of two venues a few metres apart: the camera zooms in and both labels want the same space.
  await page.locator("a.row-head", { hasText: "Twin one" }).click();
  await expect(page.getByRole("link", { name: "All events" })).toBeVisible();
  await expect(pin(page, "Twin Lounge")).toBeVisible();
  await page.waitForTimeout(900);
  const hidden = page.locator(".mk .label[data-hidden]");
  await expect(hidden.first()).toBeAttached();
  expect(await page.locator(".mk .label[style]").count()).toBe(0);
  // The selected venue keeps its label; the one under it loses its.
  await expect(pin(page, "Twin Hall").locator(".label")).not.toHaveAttribute("data-hidden", "");
  await expect(pin(page, "Twin Lounge").locator(".label")).toHaveAttribute("data-hidden", "");
  await pin(page, "Twin Lounge").hover();
  await expect(pin(page, "Twin Lounge").locator(".lt")).toBeVisible();
});

test.describe("approximate venues never move the camera (S5.6)", () => {
  const row = (page: Page) => page.locator("a.row-head", { hasText: "Open air film" });

  test("clicking one in the list opens it and leaves the map where it was", async ({ page }) => {
    await openMap(page);
    await expect(row(page)).toBeVisible();
    expect(await pin(page, "Rough Cafe").count()).toBe(0); // no marker at all
    const before = await where(page);
    await row(page).click();
    await expect(page.getByRole("link", { name: "All events" })).toBeVisible();
    await expect(page.getByText("~ Gachibowli, exact spot not confirmed")).toBeVisible();
    await page.waitForTimeout(1000); // longer than the camera takes
    expect(await where(page)).toEqual(before);
  });

  test("loading a URL that names one leaves the map where a plain load puts it", async ({ page }) => {
    await openMap(page);
    const plain = await where(page);
    const venue = (await row(page).getAttribute("data-venue"))!;
    await page.goto(`/map?venue=${venue}`);
    await expect(page.getByRole("link", { name: "All events" })).toBeVisible();
    await expect(page.locator(".mk .tile").first()).toBeVisible();
    await page.waitForTimeout(1200);
    expect(await where(page)).toEqual(plain);
  });

  test("an exact venue does move it, so the two checks above are not vacuous", async ({ page }) => {
    await openMap(page);
    const before = await where(page, "Mid Cafe");
    await page.locator("a.row-head", { hasText: "Stand up special" }).click();
    await expect(page.getByRole("link", { name: "All events" })).toBeVisible();
    await expect.poll(async () => JSON.stringify(await where(page, "Mid Cafe"))).not.toBe(JSON.stringify(before));
  });
});

test.describe("startup (S5.6)", () => {
  test("a basemap that cannot load shows the notice, keeps the list and Try again brings the map back", async ({ page }) => {
    let broken = true;
    await page.route("https://tiles.openfreemap.org/**", (route) => (broken ? route.abort() : route.fulfill({ json: STYLE.light })));
    await page.goto("/map");
    await expect(page.getByText("The map could not load")).toBeVisible();
    await expect(page.locator(".group").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains("js-map"))).toBe(false);

    broken = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("The map could not load")).toHaveCount(0);
    await expect(page.locator(".mk .tile").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains("js-map"))).toBe(true);
  });

  test("a map that never answers is given up on after the startup timeout, and the list stays", async ({ page }) => {
    await page.clock.install();
    await page.route("https://tiles.openfreemap.org/**", () => {}); // never answers
    await page.goto("/map");
    await expect(page.locator(".group").first()).toBeVisible();
    await expect(page.locator(".map-canvas")).toBeAttached(); // the map has started, so its startup timer is running
    await expect(page.getByText("The map could not load")).toHaveCount(0);
    await page.clock.fastForward(21_000);
    await expect(page.getByText("The map could not load")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.locator(".group").first()).toBeVisible();
  });
});

/** S8 fix 1: the map's own chunk (MapLibre inside it) never arrives. The startup deadline covers the import, not only the style. */
test.describe("a stalled map chunk (S8 item 1)", () => {
  async function stallMapChunk(page: import("@playwright/test").Page, hold: { on: boolean; held: Array<() => void> }) {
    await page.route(/\/assets\/chunk\.[0-9a-z]+\.js$/, async (route) => {
      const response = await route.fetch();
      const body = await response.body();
      // The MapCanvas chunk is the one that carries MapLibre: over 500 KB. Everything else is needed to hydrate and goes through.
      if (body.length > 500_000 && hold.on) {
        await new Promise<void>((resolve) => hold.held.push(resolve));
      }
      await route.fulfill({ response, body });
    });
  }

  test("shows the notice and the whole list after the deadline, and Try again brings the map back; a late chunk cannot resurrect the old attempt", async ({
    page,
  }) => {
    const hold = { on: true, held: [] as Array<() => void> };
    await page.clock.install();
    await stallMapChunk(page, hold);
    await page.goto("/map");
    await expect(page.locator(".group").first()).toBeVisible();
    await expect(page.getByText("The map could not load")).toHaveCount(0);
    await page.clock.fastForward(21_000);
    await expect(page.getByText("The map could not load")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains("js-map"))).toBe(false);
    await expect(page.locator("#panel .vh").first()).toHaveText("12 events");

    // The first attempt's chunk finally arrives: it must not put a map on the page that the reader has given up on.
    hold.on = false;
    for (const release of hold.held) release();
    await page.waitForTimeout(800);
    await expect(page.locator(".map-canvas")).toHaveCount(0);
    await expect(page.getByText("The map could not load")).toBeVisible();

    // Try again starts a new attempt, which now loads.
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("The map could not load")).toHaveCount(0);
    await expect(page.locator(".mk .tile").first()).toBeVisible();
  });
});

/** S8 fix 2: failures after the map is up. A replacement basemap that fails keeps the good one; a dead map gives the whole list back. */
test.describe("failures after startup (S8 item 2)", () => {
  /** A dark style whose JSON is valid but whose one source answers 404, so the failure comes after setStyle. */
  const brokenDark = {
    version: 8,
    sources: { gone: { type: "geojson", data: "https://tiles.openfreemap.org/gone.json" } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#0c0c0c" } },
      { id: "gone", type: "circle", source: "gone" },
    ],
  };

  test("a replacement basemap whose source 404s leaves the previous map and shows no notice", async ({ page }) => {
    await page.route("https://tiles.openfreemap.org/styles/dark", (route) => route.fulfill({ json: brokenDark }));
    await page.route("https://tiles.openfreemap.org/gone.json", (route) => route.fulfill({ status: 404, body: "no" }));
    await openMap(page);
    await expect(page.locator("#panel .vh").first()).toHaveText(/ in view$/);
    const toggle = page.locator("#theme-toggle");
    await toggle.click(); // light
    await toggle.click(); // dark: the style arrives, then its source fails
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.waitForTimeout(1500);
    expect(await basemap(page)).toBe("light"); // the working basemap is back on screen
    await expect(page.getByText("The map could not load")).toHaveCount(0);
    await expect(page.locator(".map-canvas")).toBeAttached();
    await expect(page.locator(".mk .tile").first()).toBeVisible();
    await expect(page.locator("#panel .vh").first()).toHaveText(/ in view$/); // still the map's list
  });

  test("a map that dies gives back every current match, with an honest heading, and Try again restores it", async ({ page }) => {
    await openMap(page);
    await expect(page.locator("#panel .vh").first()).toHaveText(/^10 events in view$/); // a viewport exists, and it holds 10 of the 12
    await page.evaluate(() =>
      (document.querySelector(".maplibregl-canvas") as HTMLCanvasElement)
        .getContext("webgl2")!
        .getExtension("WEBGL_lose_context")!
        .loseContext(),
    );
    await expect(page.getByText("The map could not load")).toBeVisible();
    await expect(page.locator("#panel .vh").first()).toHaveText("12 events"); // all of them, not the 10 that were in view
    await expect(page.locator("#panel .row-head")).toHaveCount(12);
    expect(await page.locator("#count").innerText()).toContain("12 events");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".mk .tile").first()).toBeVisible();
    await expect(page.locator("#panel .vh").first()).toHaveText(/ in view$/);
  });
});

test("the Near me circle and the dot follow the location state, and the radius live (S5.4)", async ({ page }) => {
  await openMap(page);
  const ring = () => page.locator(".map-canvas").getAttribute("data-ring");
  expect(await ring()).toBe("");
  await page.getByRole("button", { name: "Near me" }).click();
  await expect.poll(ring).toBe("4");
  await expect(page.locator(".me")).toHaveCount(1);
  await page.locator('[data-slot="slider-thumb"] input').focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect.poll(ring).toBe("6");
  await page.getByRole("button", { name: "Near me" }).click();
  await expect.poll(ring).toBe("");
  await expect(page.locator(".me")).toHaveCount(0);
});
