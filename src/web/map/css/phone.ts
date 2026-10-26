/** Under 720 px: the top row, the filter row, the control column and the sheet before and without its chunk. Written with the DESIGN.md tokens only (tokens.ts); the arrangement is owned by the surface it styles. */
import { LAYOUT } from "../layout.js";
import { PHONE } from "./media.js";

export const phoneCss = (): string => `@media ${PHONE} {
  .js-map .map-app { inset: 0; border-radius: 0; box-shadow: none; }
  /* Row one is the mark, the search and the two switches, one line. Row two is the filter row, which scrolls sideways and stays
     reachable at every detent. The control column hangs below it at the right edge. The count is the sheet's heading. */
  .js-map .map-top { top: calc(var(--card-edge) + env(safe-area-inset-top, 0px)); left: var(--card-edge); right: var(--card-edge); flex-wrap: nowrap; }
  .brand-word { display: none; }
  .brand-link { width: var(--control-height); padding: 0; justify-content: center; }
  .js-map .pill.search { flex: 1 1 0; min-width: 0; }
  .js-map .pill.search input { width: 100%; }
  /* The row scrolls sideways, which clips what overflows it vertically too: its padding is the 4 px (and the 1 px border) that a
     36 px pill's 44 px target extends past it, so the whole target stays inside the row; the top moves up by the same amount. */
  .js-map .pills { --hit-pad: calc((var(--hit) - var(--pill-height)) / 2 + 1px); padding-block: var(--hit-pad);
    top: calc(var(--card-edge) + var(--control-height) + var(--spacing-2) - var(--hit-pad) + env(safe-area-inset-top, 0px)); bottom: auto; left: 0; right: 0; flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain; pointer-events: auto;
    padding-inline: var(--card-edge); scroll-snap-type: x proximity; scroll-padding-inline: var(--card-edge); scrollbar-width: none; }
  .js-map .pills::-webkit-scrollbar { display: none; }
  .js-map .pills > * { flex: none; scroll-snap-align: start; }
  .js-map .pill.filters form { position: fixed; top: calc(var(--spacing-8) * 3); left: var(--spacing-4); right: var(--spacing-4); min-width: 0; }
  .js-map .count { display: none; }
  .unplaced { display: inline; }
  .js-map .map-controls { top: calc(var(--card-edge) + var(--control-height) * 2 + var(--spacing-2) * 3 + env(safe-area-inset-top, 0px)); right: var(--card-edge); transform: none; }
  .js-map .maplibregl-ctrl-bottom-right { bottom: var(--sheet-peek); }
  .js-map .panel { top: auto; right: 0; left: 0; bottom: 0; width: auto; max-height: none; height: var(--sheet, var(--sheet-peek)); border-radius: var(--rounded-sheet) var(--rounded-sheet) 0 0; padding-top: 0;
    transition: height var(--motion-base) var(--ease-out); overscroll-behavior: contain; }
  /* Grip: 20 px (the handle's 4 px sits 8 px down) so the heading starts right under it. */
  .sheet-controls { display: block; position: sticky; top: 0; height: var(--spacing-5); border-radius: var(--rounded-sheet) var(--rounded-sheet) 0 0; margin: 0 calc(var(--card-padding) * -1); z-index: 2; }
  .sheet-handle { position: absolute; left: 50%; top: ${LAYOUT.handle.top}px; transform: translateX(-50%); width: ${LAYOUT.handle.width}px; height: ${LAYOUT.handle.height}px; border-radius: ${LAYOUT.handle.radius}px; background: var(--line); cursor: grab; touch-action: none; }
  .sheet-handle::before { content: ""; position: absolute; inset: calc(${LAYOUT.handle.top}px * -1) calc(var(--spacing-8) * -1) calc((var(--hit) - ${LAYOUT.handle.top}px - ${LAYOUT.handle.height}px) * -1); } /* 44 px, from the sheet's top edge down: never above it */
  .detents { position: absolute; right: var(--spacing-2); top: 0; display: flex; }
  .detents button { all: unset; cursor: pointer; width: var(--hit); height: var(--hit); display: grid; place-items: center; color: var(--muted-foreground); border-radius: var(--rounded-full); touch-action: manipulation; }
  .js-map .map-app[data-snap="half"] { --sheet: var(--sheet-half); }
  .js-map .map-app[data-snap="full"] { --sheet: var(--sheet-full); }
  .js-map .map-app[data-snap="peek"] { --sheet: var(--sheet-peek); }
  /* At peek (DESIGN.md, Sheet) the sheet is the heading and one row: the Group by switch and the section headers step aside. */
  .vh { margin-top: 0; margin-bottom: var(--spacing-1); }
  .map-app[data-snap="peek"] .group-by, .map-app[data-snap="peek"] .group > h3, .map-app[data-snap="peek"] .venue > h3, .map-app[data-snap="peek"] .venue > div:not([data-slot]) { display: none; }
  .map-app[data-snap="peek"] .group, .map-app[data-snap="peek"] .venue { border-top: 0; }
}
`;
