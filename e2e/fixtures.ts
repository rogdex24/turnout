import { test as base, expect } from "@playwright/test";

/** An empty vector style: the tests never touch the real basemap, so they need no network and no tile server. */
const blank = (color: string) => ({
  version: 8,
  sources: {
    credit: {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      attribution:
        '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    { id: "credit", type: "circle", source: "credit" },
    { id: "background", type: "background", paint: { "background-color": color } },
  ],
});
/** The light and dark basemaps differ, so a test can tell which one is on screen. */
export const STYLE = { light: blank("#f2f3f0"), dark: blank("#0c0c0c") };

/** Fixture covers: a landscape cover and a portrait poster, drawn as SVG so they need no files and no network. */
const cover = (w: number, h: number, label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f7cff"/><stop offset="1" stop-color="#e93d82"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w / 8)}" fill="#fff">${label}</text></svg>`;

export const test = base.extend<{ basemap: "ok" | "fail"; adminUrl: string }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies from the first argument and requires a destructuring pattern, even an empty one
  adminUrl: async ({}, use, testInfo) => use(testInfo.config.metadata.adminUrl as string),
  basemap: ["ok", { option: true }],
  page: async ({ page, basemap }, use) => {
    await page.route("https://tiles.openfreemap.org/**", (route) =>
      process.env.SHOTS_LIVE
        ? route.continue()
        : basemap === "fail"
          ? route.abort()
          : route.fulfill({ json: route.request().url().endsWith("/dark") ? STYLE.dark : STYLE.light }),
    );
    await page.route("https://img.example.test/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: route.request().url().endsWith("portrait.svg") ? cover(450, 800, "Poster") : cover(800, 450, "Cover"),
      }),
    );
    await use(page);
  },
});

export { expect };
