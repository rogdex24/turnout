import { expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { assetResponse, buildMapAssets, mapAssetsNow } from "../src/web/map/assets.js";

const gz = (bytes: Uint8Array) => gzipSync(bytes).length;

test("the bundle is built for production and its entry stays inside the DESIGN.md budget", async () => {
  const assets = (await buildMapAssets())!;
  const js = new Uint8Array(await assetResponse(assets.js)!.arrayBuffer());
  const text = new TextDecoder().decode(js);
  expect(text).not.toContain("Download the React DevTools");
  expect(text).not.toContain("react-dom.development");
  expect(text).not.toContain("process.env.NODE_ENV");
  // The entry chunk: client code, React and the Base UI parts used on first paint.
  expect(gz(js)).toBeLessThanOrEqual(400_000);
});

/**
 * DESIGN.md, Bundle budget. First load is the entry, the chunks it imports, the map chunk (MapLibre and MapCanvas), the CSS and the
 * worker. A phone also fetches the sheet chunk and what it imports at load, so its first load is that plus those chunks. Both are
 * at most 580 KB gzipped. The rest is on demand (the Filters popover, the distance slider): at most 70 KB in all.
 */
const measure = async () => {
  await buildMapAssets();
  const assets = mapAssetsNow()!;
  let first = 0;
  let phone = 0;
  let lazy = 0;
  for (const [path, file] of assets.files) {
    const size = gz(file.body);
    if (!assets.onDemand.has(path)) first += size;
    else if (assets.phone.has(path)) phone += size;
    else lazy += size;
  }
  return { first, phone: first + phone, lazy };
};

test("first load stays within 580 KB", async () => {
  expect((await measure()).first).toBeLessThanOrEqual(580_000);
});

test("a phone's first load, with the sheet chunks it fetches at load, stays within 580 KB", async () => {
  const assets = (await buildMapAssets())!;
  expect(mapAssetsNow()!.phone.size).toBeGreaterThanOrEqual(2); // the sheet and the Base UI code it shares
  expect(assets.phone.size).toBeGreaterThan(0);
  expect((await measure()).phone).toBeLessThanOrEqual(580_000);
});

test("on-demand chunks (popover, slider) stay within 70 KB in all", async () => {
  const { lazy } = await measure();
  expect(lazy).toBeLessThanOrEqual(70_000);
});
