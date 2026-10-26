import { designTokensCss } from "../tokens.js";
import { baseCss } from "./base.js";
import { filtersCss } from "./filters.js";
import { layoutCss } from "./layout.js";
import { markersCss } from "./markers.js";
import { panelCss } from "./panel.js";
import { phoneCss } from "./phone.js";
import { sheetCss } from "./sheet.js";

/**
 * The /map stylesheet. Every color, radius, spacing step and type style comes from the generated DESIGN.md block (tokens.ts);
 * the files beside this one only arrange them, one per surface. Without JavaScript the page is a normal document: pills, then the
 * venue list. With it (html.js-map) the map fills the frame and the pills, count and panel float above it. Category is carried by
 * a glyph and a word, never by color. The order matters (later wins at equal specificity): phone and sheet come last.
 */
export function mapCss(): string {
  return [designTokensCss(), baseCss(), filtersCss(), panelCss(), layoutCss(), markersCss(), phoneCss(), sheetCss()].join("\n");
}
