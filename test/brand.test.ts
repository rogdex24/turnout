import { expect, test } from "bun:test";
import { siteResponse } from "../src/web/index.js";
import { memoryDb } from "./helpers.js";

const db = memoryDb();
const get = (path: string) => siteResponse(db, new Request(`http://local${path}`)) as Response;

test("the favicon is served as SVG and /favicon.ico points at it", async () => {
  const svg = get("/favicon.svg");
  expect(svg.status).toBe(200);
  expect(svg.headers.get("content-type")).toContain("image/svg+xml");
  expect(await svg.text()).toContain("<svg");

  const ico = get("/favicon.ico");
  expect(ico.status).toBe(301);
  expect(ico.headers.get("location")).toBe("/favicon.svg");
});

test("the listing and the map link the favicon and show the Hyd Tonight lockup", async () => {
  for (const path of ["/", "/map"]) {
    const html = await get(path).text();
    expect(html).toContain('<link rel="icon" href="/favicon.svg"');
    expect(html).toContain('aria-label="Hyd Tonight"');
    expect(html).not.toContain("Kya Scene");
  }
});

test("the listing and the map apply a stored theme before paint and ship the toggle", async () => {
  for (const path of ["/", "/map"]) {
    const html = await get(path).text();
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain('localStorage.getItem("theme")');
    expect(html).toContain('id="theme-toggle"');
  }
  // The listing wires its toggle with an inline script; the map's is a React component in the bundle.
  expect(await get("/").text()).toContain('dispatchEvent(new Event("themechange"))');
});
