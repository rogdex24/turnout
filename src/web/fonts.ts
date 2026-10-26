import { createHash } from "node:crypto";
import fs from "node:fs";

/**
 * Inter, self-hosted (DESIGN.md, Typography). Two files behind one family name, each with a
 * unicode-range, so a page downloads the second only when it shows a character from it:
 *  - latin: the package's Latin subset, from @fontsource-variable/inter.
 *  - rupee: U+20B9 alone, a 1.2 KB subset of the package's latin-ext file (scripts/subset-inter-rupee.sh).
 *    Latin has no rupee sign and latin-ext weighs 85 KB, so prices would otherwise fall back to a system font.
 * Each URL carries a hash of its bytes, so it is cached for a year and still changes on an upgrade.
 */
const LATIN = new URL("../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", import.meta.url);
const RUPEE = new URL("./fonts/inter-rupee.woff2", import.meta.url);

function load(file: URL, name: string) {
  const body = new Uint8Array(fs.readFileSync(file));
  return { body, url: `/assets/fonts/${name}.${createHash("sha256").update(body).digest("hex").slice(0, 10)}.woff2` };
}

const latin = load(LATIN, "inter-latin");
const rupee = load(RUPEE, "inter-rupee");

export const INTER_URL = latin.url;
export const INTER_RUPEE_URL = rupee.url;

/** Same range as the package's own latin face. */
const LATIN_RANGE =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

const face = (url: string, range: string) =>
  `@font-face { font-family: "Inter Variable"; font-style: normal; font-display: swap; font-weight: 100 900; src: url(${url}) format("woff2-variations"); unicode-range: ${range}; }`;

export const INTER_FONT_FACE = `${face(latin.url, LATIN_RANGE)}\n${face(rupee.url, "U+20B9")}`;

export function fontResponse(path: string): Response | null {
  const file = [latin, rupee].find((f) => f.url === path);
  if (!file) return null;
  return new Response(file.body, { headers: { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" } });
}
