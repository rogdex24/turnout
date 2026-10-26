/** The phone sheet once its chunk is in (the Drawer), the touch-action rule and reduced motion. Written with the DESIGN.md tokens only (tokens.ts); the arrangement is owned by the surface it styles. */
import { LAYOUT } from "../layout.js";

export const sheetCss =
  (): string => `/* The phone sheet once its chunk is in: a non-modal Drawer (DESIGN.md, Sheet). The popup is as tall as the full detent and a snap
   point slides it down by an offset, so the map above stays interactive; the viewport lets pointer input through. */
.drawer-viewport { position: fixed; inset: 0; z-index: 4; pointer-events: none; }
.drawer-popup { pointer-events: auto; position: fixed; left: 0; right: 0; bottom: 0; height: calc(100dvh - ${LAYOUT.sheetFullInset}px); display: flex; flex-direction: column; outline: none;
  transform: translate3d(0, calc(var(--drawer-snap-point-offset, 0px) + var(--drawer-swipe-movement-y, 0px)), 0);
  transition: transform var(--motion-base) var(--ease-out);
  background: var(--surface-glass); backdrop-filter: blur(var(--blur)); border: 1px solid var(--line); border-bottom: 0;
  border-radius: var(--rounded-sheet) var(--rounded-sheet) 0 0; box-shadow: var(--e3); }
.drawer-popup[data-swiping] { transition: none; }
.drawer-popup[data-starting-style], .drawer-popup[data-ending-style] { transform: translate3d(0, 100%, 0); }
.drawer-content { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.drawer-popup .sheet-controls { display: block; position: relative; flex: none; margin: 0; }
.sheet-handle { display: block; border: 0; padding: 0; }
.panel-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; /* The scroll area is as tall as the full sheet, and below the detent the lower part of it is off screen: that part is added to its
   bottom padding, so scrolling to the end brings the last row up into the part that shows. */
  padding: 0 var(--card-padding) calc(var(--spacing-8) + env(safe-area-inset-bottom, 0px) + var(--sheet-hidden, 0px)); }
@media (prefers-reduced-motion: reduce) {
  .drawer-popup { transition: none; }
}
/* Everything that is pressed is a control: no double-tap zoom delay (DESIGN.md, Accessibility). */
.pill, .button, .link, .row-head, .close, .view-switch a, .brand-link, .seg, .trigger, .tile, .cluster, summary,
.detents button, .filters-popover select, .filters-popover input, [data-slot="combobox-input"], [data-slot="combobox-trigger"] { touch-action: manipulation; }
@media (prefers-reduced-motion: reduce) {
  .js-map .panel, .tile, .pill, .row-head, .close, .button, .seg, .view-switch a { transition: none; }
  .skel::after { animation: none; }
  .group .trigger > .i, .venue .trigger > .i { transition: none; }
  .me::after { animation: none; opacity: 0; }
}`;
