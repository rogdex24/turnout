import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * The screenshot matrix of docs/map-states.md: `SHOTS=docs/screenshots/map-v2/after SHOTS_LIVE=1 bun run e2e e2e/shots.spec.ts`.
 * File names are `<state>-<size>-<theme>.png`. Skipped in a normal run.
 */
const dir = process.env.SHOTS;
test.skip(!dir, "set SHOTS=<dir> to take screenshots");

const themes = ["light", "dark"] as const;
const sizes = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } } as const;
type Size = keyof typeof sizes;

const tiles = (page: Page) => page.locator(".mk .tile");
/** The map is ready once the pins exist. */
async function ready(page: Page) {
  await expect(tiles(page).first()).toBeVisible();
}

interface Shot {
  state: string;
  sizes?: Size[];
  run: (page: Page, size: Size) => Promise<void>;
  path?: string;
  waitForMap?: boolean /** A server-rendered page (S7): no map, no sheet. */;
  plain?: boolean;
}

const shots: Shot[] = [
  { state: "idle", run: async () => {} },
  // State 5: zoomed out one step, so the stacked clusters are the whole picture.
  {
    state: "cluster",
    run: async (page) => {
      await page.getByRole("button", { name: "Zoom out", exact: true }).click();
      await page.waitForTimeout(1500);
    },
  },
  // State 4: tap a tile; the card or the sheet at half opens on its venue.
  {
    state: "venue",
    run: async (page) => {
      await page.getByRole("button", { name: /^Jazz night at Near Hall/ }).click();
    },
  },
  // State 6: an approximate venue has no tile; its event (e12) opens the venue card with the "exact spot not confirmed" line, and the map stays put.
  { state: "approximate", path: "/map?event=e12", run: async () => {} },
  // State 7: with an image, a poster, an organiser and neither.
  { state: "event-cover", path: "/map?event=e1", run: async () => {} },
  { state: "event-poster", path: "/map?event=e4", run: async () => {} },
  { state: "event-organiser", path: "/map?event=e2", run: async () => {} },
  { state: "event-plain", path: "/map?event=e3", run: async () => {} },
  { state: "group-day", path: "/map?group=day", run: async () => {} },
  { state: "group-venue", path: "/map?group=venue", run: async () => {} },
  // States 12 to 15.
  { state: "loading", path: "/map?state=loading", waitForMap: false, run: async () => {} },
  { state: "empty", path: "/map?state=empty", waitForMap: false, run: async () => {} },
  { state: "error", path: "/map?state=error", waitForMap: false, run: async () => {} },
  { state: "denied", path: "/map?state=denied", run: async () => {} },
  {
    state: "filters-open",
    run: async (page) => {
      await page.getByRole("button", { name: /^Filters/ }).click();
      await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
      await page.getByRole("combobox", { name: "Type" }).fill("m");
      await expect(page.getByRole("option").first()).toBeVisible();
    },
  },
  {
    state: "near-me",
    run: async (page) => {
      await page.getByRole("button", { name: "Near me" }).click();
      await expect(page.locator('[data-slot="slider-thumb"]')).toBeVisible();
    },
  },
  // States 2 and 3, on one control each.
  {
    state: "hover",
    sizes: ["desktop"],
    run: async (page) => {
      await page.getByRole("link", { name: "This weekend", exact: true }).hover();
    },
  },
  {
    state: "focus",
    sizes: ["desktop"],
    run: async (page) => {
      await page.getByRole("link", { name: "Hyd Tonight" }).focus();
      for (let i = 0; i < 3; i += 1) await page.keyboard.press("Tab");
    },
  },
  // S7: the listing and an event page, which have no map.
  { state: "listing", path: "/", plain: true, run: async () => {} },
  { state: "listing-filtered", path: "/?category=comedy&free=true", plain: true, run: async () => {} },
  { state: "event-page", path: "/e/e1", plain: true, run: async () => {} },
  { state: "go-fallback", path: "/e/e1/go", plain: true, run: async () => {} },
  // The phone sheet at each detent.
  ...(["peek", "half", "full"] as const).map(
    (detent): Shot => ({
      state: `sheet-${detent}`,
      sizes: ["phone"],
      run: async (page) => {
        for (const step of detent === "peek" ? [] : detent === "half" ? ["Expand"] : ["Expand", "Expand"])
          await page.getByRole("button", { name: step, exact: true }).click();
      },
    }),
  ),
];

for (const theme of themes) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme });
    for (const shot of shots) {
      for (const size of shot.sizes ?? (["desktop", "phone"] as const)) {
        test(`${shot.state} ${size}`, async ({ page }) => {
          await page.setViewportSize(sizes[size]);
          await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
          await page.goto(shot.path ?? "/map");
          if (shot.waitForMap !== false && !shot.plain) await ready(page);
          if (size === "phone" && shot.state !== "error" && !shot.plain)
            await expect(page.locator('[data-slot="drawer-popup"]')).toBeVisible();
          await shot.run(page, size);
          await page.waitForTimeout(shot.plain ? 400 : process.env.SHOTS_LIVE ? 3500 : 800);
          await page.screenshot({ path: path.join(dir!, `${shot.state}-${size}-${theme}.png`), fullPage: !!shot.plain });
        });
      }
    }
  });
}
