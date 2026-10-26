/**
 * The Hyd Tonight mark: a venue tile (64 unit grid, radius 19, the same 0.3 ratio as the
 * map's marker tile) holding a crescent moon. Only the geometry lives here. The two colors
 * come from DESIGN.md (`ink`, `primary-dark`) through readDesignFront, so the public
 * favicon, the header lockup and the admin favicon share one source.
 */
import { readDesignFront } from "./design.js";
import { MARK } from "./markShape.js";

export function markSvg(attrs = ""): string {
  const { ink, "primary-dark": moon } = readDesignFront().colors;
  return (
    `<svg ${attrs} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="64" height="64" rx="${MARK.radius}" fill="${ink}"/>` +
    `<mask id="hyd-crescent"><rect width="64" height="64" fill="#fff"/><circle cx="${MARK.cut.cx}" cy="${MARK.cut.cy}" r="${MARK.cut.r}" fill="#000"/></mask>` +
    `<circle cx="${MARK.moon.cx}" cy="${MARK.moon.cy}" r="${MARK.moon.r}" fill="${moon}" mask="url(#hyd-crescent)"/>` +
    `</svg>`
  );
}
