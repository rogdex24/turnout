/** With JavaScript (html.js-map): the frame, the chrome positions around the card, the attribution. Written with the DESIGN.md tokens only (tokens.ts); the arrangement is owned by the surface it styles. */
import { LAYOUT } from "../layout.js";
import { WIDE } from "./media.js";

export const layoutCss = (): string => `/* With JavaScript: the app layout. Chrome is 12 px from the frame (card-edge), as the card is. */
.js-map body.map-page { height: 100dvh; overflow: hidden; }
.js-map .map-app { position: fixed; inset: var(--frame-inset); border-radius: var(--rounded-panel); overflow: hidden; overflow-x: clip; background: var(--map); box-shadow: var(--e3); }
.js-map #map { display: block; position: absolute; inset: 0; }
/* Top left: the row wraps before the card starts. Bottom left: the filter row above the count. Beside the card: the control column. */
.js-map .map-top { position: absolute; top: var(--card-edge); left: var(--card-edge); right: calc(var(--card-width) + var(--card-edge) * 2); z-index: 3; pointer-events: none; padding: 0; }
.js-map .map-top > * { pointer-events: auto; }
.js-map .pills { position: absolute; left: var(--card-edge); right: calc(var(--card-width) + var(--card-edge) * 2); bottom: calc(var(--card-edge) + var(--control-height) + var(--spacing-2)); z-index: 3; pointer-events: none; padding: 0; }
.js-map .pills > * { pointer-events: auto; }
.js-map .count { position: absolute; left: var(--card-edge); bottom: var(--card-edge); z-index: 3; display: inline-flex; align-items: center; height: var(--control-height); padding: 0 var(--spacing-4); background: var(--surface);
  border: 1px solid var(--line); border-radius: var(--rounded-full); box-shadow: var(--e1); }
.js-map .map-controls { position: absolute; z-index: 3; top: 50%; transform: translateY(-50%); right: calc(var(--card-width) + var(--card-edge) + var(--spacing-2)); }
@media ${WIDE} {
  .js-map .map-top, .js-map .pills { right: calc(var(--card-wide-width) + var(--card-edge) * 2); }
  .js-map .map-controls { right: calc(var(--card-wide-width) + var(--card-edge) + var(--spacing-2)); }
  .js-map .maplibregl-ctrl-bottom-right { right: calc(var(--card-wide-width) + var(--card-edge)); }
}
@media (min-width: ${LAYOUT.phoneBelow}px) and (max-width: ${LAYOUT.wideFrom - 1}px) { .js-map .maplibregl-ctrl-bottom-right { right: calc(var(--card-width) + var(--card-edge)); } }
.js-map .panel { position: absolute; top: var(--card-edge); right: var(--card-edge); max-height: calc(100% - var(--card-edge) * 2); width: var(--card-width); max-width: none; z-index: 3; overflow-y: auto;
  background: var(--surface-glass); backdrop-filter: blur(var(--blur)); border: 1px solid var(--line); border-radius: var(--rounded-panel); box-shadow: var(--e3); padding: var(--card-padding); }
@media ${WIDE} { .js-map .panel { width: var(--card-wide-width); } }
.js-map .attribution { display: none; }
/* The attribution is legal text, so it is legible in both themes: glass surface, muted-foreground (6.17:1 in dark), and the info
   button's black icon is inverted in dark (--attrib-icon). The extra class beats MapLibre's own rule on specificity. */
.js-map .maplibregl-ctrl.maplibregl-ctrl-attrib { font: var(--weight-label) var(--font-label); background: var(--surface-glass); color: var(--muted-foreground); border-radius: var(--rounded-xs); }
.js-map .maplibregl-ctrl-attrib a { color: var(--muted-foreground); }
.js-map .maplibregl-ctrl-attrib-button { filter: var(--attrib-icon); }
.sheet-controls { display: none; }

`;
