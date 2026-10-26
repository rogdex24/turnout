/** The panel content: heading, Group by, accordion sections, the one event row anatomy, the open event card, skeletons. Written with the DESIGN.md tokens only (tokens.ts); the arrangement is owned by the surface it styles. */
import { HOVER, hoverTint, pressTint } from "@web/ui/chrome";
import { LAYOUT } from "../layout.js";

export const panelCss =
  (): string => `/* Card and sheet content. The panel has an 8 px inset, so a row or card inside it is 8 px from the edge and concentric with its
   24 px corner; headings and text blocks add 12 px of their own (.inset) and line up with the thumbnails. */
.panel { padding: 0 var(--card-padding) var(--spacing-8); max-width: calc(var(--spacing-8) * 14); }
.inset { padding-inline: var(--spacing-3); }
.vh { font: var(--weight-heading) var(--font-heading); margin: var(--spacing-3) 0 var(--spacing-2); text-wrap: balance; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.unplaced { display: none; font: var(--weight-meta) var(--font-meta); color: var(--muted-foreground); white-space: nowrap; }
.lede { margin: 0 0 var(--spacing-3); }
.back { display: flex; width: max-content; min-height: var(--hit); margin: 0; }
.venue, .group { border-top: 1px solid var(--line); }
.venue .vn { margin: 0; padding: var(--spacing-3) var(--spacing-3) 0; font: var(--weight-title) var(--font-title); text-wrap: balance; }
.venue .vn a { text-decoration: none; }
/* List sections are a shadcn Accordion (DESIGN.md, Panel list): the trigger is the whole header, a chevron shows the state. */
.group .trigger, .venue .trigger { width: 100%; min-height: var(--hit); padding: 0 var(--spacing-3); border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; gap: var(--spacing-2); border-radius: var(--rounded-card); }
.group .trigger > .i, .venue .trigger > .i { color: var(--muted-foreground); transition: transform var(--motion-fast) var(--ease-out); }
.group .trigger[aria-expanded="false"] > .i, .venue .trigger[aria-expanded="false"] > .i { transform: rotate(-90deg); }
.group [data-slot="accordion-content"], .venue [data-slot="accordion-content"] { padding-bottom: var(--spacing-2); }
.sh { display: grid; gap: var(--spacing-1); min-width: 0; }
.gh { margin: 0; font: var(--weight-title) var(--font-title); display: flex; align-items: center; gap: var(--spacing-1); }
.gh .m-cat { color: var(--ink); gap: var(--spacing-2); }
.group-by { display: flex; align-items: center; gap: var(--spacing-2); margin: 0 0 var(--spacing-3); font: var(--weight-meta) var(--font-meta); }
.segs { display: inline-flex; gap: 0; padding: 2px; border: 1px solid var(--line); border-radius: var(--rounded-full); }
.seg { position: relative; display: inline-flex; align-items: center; height: calc(var(--control-height) - var(--spacing-2) - 2px); padding: 0 var(--spacing-3); border-radius: var(--rounded-full); color: var(--muted-foreground); text-decoration: none; font: var(--weight-control) var(--font-meta);
  transition: background-color var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out); }
.seg::before { content: ""; position: absolute; inset: calc((var(--hit) - (var(--control-height) - var(--spacing-2) - 2px)) / -2) 0; }
.seg[aria-current="true"] { background: var(--primary); color: var(--on-primary); }
@media ${HOVER} { .seg:not([aria-current="true"]):hover { color: var(--ink); } }
.seg:focus-visible { outline: var(--ring-focus) solid var(--primary); outline-offset: var(--ring-offset); }
.m-venue { font-variant-numeric: tabular-nums; display: flex; align-items: center; gap: var(--spacing-1); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-venue .i { flex: none; }
/* One row anatomy (DESIGN.md, Event row): rows 8 apart; inside, 4 above and below, 12 at the sides and between thumbnail and text; text lines 4 apart. */
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--spacing-2); }
.row-head { display: flex; gap: var(--spacing-3); min-height: var(--event-row-height); padding: var(--event-row-padding) var(--spacing-3); border-radius: var(--rounded-card); text-decoration: none; align-items: center;
  transition: background-color var(--motion-fast) var(--ease-out); }
@media ${HOVER} { .row-head:hover { background: ${hoverTint}; } }
.row-head:active { background: ${pressTint}; }
.row-head .body { display: grid; gap: var(--spacing-1); min-width: 0; }
.rt { font: var(--weight-title) var(--font-control); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.m-date { color: var(--ink); font-weight: var(--weight-control); }
.m-time { color: var(--ink); font-variant-numeric: tabular-nums; }
.m-price { color: var(--primary); font-weight: var(--weight-control); font-variant-numeric: tabular-nums; }
.m-from { color: var(--muted-foreground); font-weight: var(--weight-meta); }
.m-cat { display: inline-flex; align-items: center; gap: var(--spacing-1); vertical-align: bottom; }
.m-sep { opacity: .5; }
.thumb, .cover { position: relative; display: block; overflow: hidden; border-radius: var(--rounded-tile); background: var(--ph); flex: none; }
.thumb { width: var(--event-thumbnail-size); height: var(--event-thumbnail-size); }
.ph { position: absolute; inset: 0; display: grid; place-items: center; background: var(--ph); color: var(--ink); }
.ph .i { opacity: .4; }
.ph .cat-icon { opacity: .85; }
.pic { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: var(--ph); }
/* The open event is a card (DESIGN.md, Expanded event): the cover is inset 4 px so its 12 px corner is the card's 16 minus 4, and the
   row's own link becomes the close button over the cover. */
.row.open { position: relative; padding: var(--event-row-padding); border-radius: var(--rounded-card); background: var(--surface); box-shadow: var(--e1), 0 0 0 1px var(--line); }
.close { position: absolute; z-index: 1; top: calc(var(--event-row-padding) + var(--spacing-3)); right: calc(var(--event-row-padding) + var(--spacing-3)); display: grid; place-items: center; width: var(--control-height); height: var(--control-height);
  border-radius: var(--rounded-full); background: var(--surface-glass); backdrop-filter: blur(var(--blur)); color: var(--ink); box-shadow: var(--e1), 0 0 0 1px var(--line); text-decoration: none; cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-out); }
.close::before { content: ""; position: absolute; inset: calc((var(--hit) - var(--control-height)) / -2); }
@media ${HOVER} { .close:hover { background: ${hoverTint}; } }
.expanded { display: grid; gap: var(--spacing-3); }
.xbody { display: grid; gap: var(--spacing-3); padding: 0 var(--spacing-3) var(--spacing-3); min-width: 0; }
.cover { width: 100%; aspect-ratio: 16 / 9; }
.cover .bg { display: none; position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scale(1.15);
  filter: blur(var(--poster-blur)) brightness(var(--poster-dim)); }
.cover.poster .bg { display: block; }
.cover.poster .pic { object-fit: contain; background: transparent; }
.et { margin: 0; font: var(--weight-title) var(--font-title); text-wrap: balance; }
.xbody .meta { margin: 0; }
.organiser { display: flex; gap: var(--spacing-3); align-items: center; font: var(--weight-control) var(--font-control); }
.avatar { width: var(--organiser-avatar-size); height: var(--organiser-avatar-size); border-radius: var(--rounded-full); background: var(--ph); display: grid; place-items: center; flex: none;
  color: color-mix(in srgb, var(--ink) 70%, transparent); font: var(--weight-control) var(--font-control); }
.actions { display: flex; flex-wrap: wrap; gap: var(--spacing-2); align-items: center; }
.rating { display: inline-flex; align-items: center; gap: var(--spacing-1); font: var(--weight-meta) var(--font-meta); }
.rating .stars { display: inline-flex; color: var(--line); }
.rating .stars .on { color: var(--ink); }

/* Skeleton: final-size placeholders while data loads (DESIGN.md, States) */
.skel { background: var(--ph-${LAYOUT.skeletonBase}); border-radius: var(--rounded-tile); position: relative; overflow: hidden; }
.skel::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, var(--ph-${LAYOUT.skeletonSweep}), transparent); transform: translateX(-100%);
  animation: sweep ${LAYOUT.skeletonMaxMs}ms ease-in-out infinite; }
@keyframes sweep { to { transform: translateX(100%); } }
.skel-heading { display: inline-block; width: 8rem; height: 1.2rem; }
.skel-row { display: flex; gap: var(--spacing-3); min-height: var(--event-row-height); padding: var(--event-row-padding) var(--spacing-3); align-items: center; }
.skel-row .thumb { background: var(--ph-${LAYOUT.skeletonBase}); }
.skel-lines { display: grid; gap: var(--spacing-2); flex: 1; align-content: start; }
.skel-lines span { height: var(--spacing-4); border-radius: var(--rounded-xs); }

`;
