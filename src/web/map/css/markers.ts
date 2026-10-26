/** Markers, labels, clusters, the location dot, toasts and notices. Written with the DESIGN.md tokens only (tokens.ts); the arrangement is owned by the surface it styles. */
import { HOVER } from "@web/ui/chrome";

export const markersCss = (): string => `/* Markers. MapLibre positions .mk; the styled control sits inside it. */
.mk { z-index: 1; }
.mk:has(.sel) { z-index: 3; }
.mk:has(.me) { z-index: 2; }
.tile, .cluster { all: unset; box-sizing: border-box; cursor: pointer; position: relative; }
.tile { display: grid; place-items: center; width: var(--marker-tile-size); height: var(--marker-tile-size); color: var(--ink);
  background: linear-gradient(160deg, color-mix(in srgb, var(--tint, var(--surface)) var(--tint-mix), var(--surface)), var(--surface));
  border: var(--marker-tile-border-width) solid var(--tile-edge); border-radius: var(--rounded-tile); box-shadow: var(--e2); transition: transform var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out); }
.tile::before { content: ""; position: absolute; inset: calc((var(--hit) - var(--marker-tile-size)) / -2); }
@media ${HOVER} { .tile:not(.ghost):hover { transform: translateY(-2px); } }
.tile.sel { width: var(--marker-tile-selected-size); height: var(--marker-tile-selected-size); box-shadow: 0 0 0 var(--ring-selected) var(--primary), var(--e2); }
.tile.skel-tile { position: absolute; overflow: hidden; width: var(--marker-tile-size); height: var(--marker-tile-size); border-radius: var(--rounded-tile); }
.badge { position: absolute; top: calc(var(--badge-offset) * -1); right: calc(var(--badge-offset) * -1); min-width: var(--badge-min); height: var(--count-badge-height); padding: 0 var(--badge-pad);
  border-radius: var(--rounded-full); background: var(--badge); color: var(--on-badge); font: var(--weight-badge) var(--font-badge); font-variant-numeric: tabular-nums; display: grid; place-items: center; }
.label { position: absolute; left: calc(100% + var(--label-gap)); top: 50%; transform: translateY(-50%); white-space: nowrap; max-width: var(--label-max); overflow: hidden; text-overflow: ellipsis;
  font: var(--weight-label) var(--font-label); color: var(--ink); background: var(--surface-glass); padding: var(--label-chip-padding); border-radius: var(--rounded-xs); box-shadow: var(--e-chip); display: none; pointer-events: none; }
.labels .tile .label, .tile.sel .label, .cluster .label { display: block; }
.label .lt, .label .lv { display: block; overflow: hidden; text-overflow: ellipsis; }
.label .lv { display: none; color: var(--muted-foreground); font-weight: var(--weight-meta); }
/* Declutter marks overlapping labels data-hidden; the one you point at always shows, above its neighbours (more specific, so it needs no priority override). */
.label[data-hidden] { visibility: hidden; }
.tile:hover .label, .tile:focus-visible .label { display: block; visibility: visible; }
.mk:has(.tile:hover), .mk:has(.tile:focus-visible) { z-index: 4; }
.tile:hover .lv, .tile:focus-visible .lv { display: block; }
.cluster { display: block; width: var(--marker-tile-size); height: var(--marker-tile-size); }
.cluster .stack { position: absolute; inset: 0; display: block; }
.cluster .tile.ghost { position: absolute; inset: 0; transform: translate(calc(var(--i) * var(--stack-offset)), calc(var(--i) * var(--stack-offset) * -1)); }
.cluster .badge { right: calc(var(--badge-offset) * -1 - var(--stack-offset) * 2); top: calc(var(--badge-offset) * -1 - var(--stack-offset) * 2); }
.cluster .label.caption { left: 50%; top: calc(100% + var(--spacing-1)); transform: translateX(-50%); }
.me { position: relative; width: var(--location-dot-size); height: var(--location-dot-size); border-radius: var(--rounded-full); background: var(--primary);
  border: 3px solid var(--surface); box-shadow: var(--e2); pointer-events: none; box-sizing: border-box; z-index: 2; }
.me::after { content: ""; position: absolute; inset: -3px; border-radius: inherit; background: var(--primary); opacity: .35; animation: me-pulse 2s ease-out infinite; }
@keyframes me-pulse { to { transform: scale(2.5); opacity: 0; } }
.toast { position: absolute; left: 50%; bottom: calc(var(--spacing-8) * 2); transform: translateX(-50%); z-index: 6; background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--rounded-full); padding: var(--spacing-2) var(--spacing-4); box-shadow: var(--e2); font: var(--weight-control) var(--font-control); }
.notice { margin: 0 var(--spacing-4) var(--spacing-3); padding: var(--spacing-3) var(--spacing-4); border: 1px solid var(--line); border-radius: var(--rounded-card); background: var(--surface); box-shadow: var(--e1); font: var(--weight-meta) var(--font-meta); color: var(--muted-foreground); }

`;
