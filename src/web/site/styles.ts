/**
 * The listing, category, area and event pages: arrangement only. Every color, size, radius, shadow and type style is a token
 * from the generated DESIGN.md block (src/web/map/tokens.ts), the same ones the map uses, and the chrome (brand, switch, pill,
 * buttons) comes from src/web/ui/chrome.ts. The page is a plain document that works without JavaScript.
 */
import { hoverTint } from "@web/ui/chrome";
import { LAYOUT } from "../map/layout.js";

export function siteCss(): string {
  return `* { box-sizing: border-box; }
body.site { margin: 0; background: var(--bg); color: var(--ink); font: var(--weight-body) var(--font-body); }
:where(.site) a { color: inherit; }
.page { max-width: calc(var(--spacing-8) * 20); margin: 0 auto; padding: 0 var(--spacing-4); }
.site-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-2); padding: var(--spacing-3) 0 var(--spacing-4); }
.site-head .grow { flex: 1; }
h1 { font: var(--weight-heading) var(--font-heading); margin: var(--spacing-2) 0 var(--spacing-1); text-wrap: balance; }
.lede { margin: 0 0 var(--spacing-4); color: var(--muted-foreground); font: var(--weight-meta) var(--font-meta); }
.filters { display: grid; gap: var(--spacing-3); margin: 0 0 var(--spacing-3); padding: var(--spacing-4); background: var(--surface); border-radius: var(--rounded-card); box-shadow: var(--e1), 0 0 0 1px var(--line); }
.filter-row { display: flex; flex-wrap: wrap; gap: var(--spacing-3) var(--spacing-4); align-items: flex-end; }
.filters label { display: grid; gap: var(--spacing-1); font: var(--weight-meta) var(--font-meta); color: var(--muted-foreground); }
.filters label.check { display: flex; align-items: center; gap: var(--spacing-2); color: var(--ink); min-height: var(--control-height); }
.filters select, .filters input:not([type="checkbox"]) { height: var(--control-height); min-width: calc(var(--spacing-8) * 4); padding: 0 var(--spacing-3); border: 1px solid var(--line); border-radius: var(--rounded-sm); background: var(--surface); color: var(--ink); font: var(--weight-body) var(--font-body); }
.filters input[type="number"] { min-width: calc(var(--spacing-8) * 3); }
.filters input[type="checkbox"] { width: var(--spacing-4); height: var(--spacing-4); accent-color: var(--primary); }
.filters select:focus-visible, .filters input:focus-visible, .filters button:focus-visible { outline: var(--ring-focus) solid var(--primary); outline-offset: var(--ring-offset); }
.filters .actions { align-items: center; }
.quick { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-2); margin: 0 0 var(--spacing-4); }
.listing { display: grid; gap: var(--spacing-2); padding-bottom: var(--spacing-4); }
.card { padding: var(--spacing-3) var(--spacing-4); background: var(--surface); border-radius: var(--rounded-card); box-shadow: var(--e1), 0 0 0 1px var(--line); transition: background-color var(--motion-fast) var(--ease-out); }
@media (hover: hover) { .card:hover { background: ${hoverTint}; } }
.card h2 { margin: 0 0 var(--spacing-1); font: var(--weight-title) var(--font-body); }
.card h2 a { text-decoration: none; }
.card h2 a:hover { text-decoration: underline; }
.card h2 a:focus-visible { outline: var(--ring-focus) solid var(--primary); outline-offset: var(--ring-offset); border-radius: var(--rounded-xs); }
.card p { margin: 0; font-variant-numeric: tabular-nums; }
.m-date { color: var(--ink); font-weight: var(--weight-control); }
.m-price { color: var(--primary); font-weight: var(--weight-control); font-variant-numeric: tabular-nums; }
.m-cat { display: inline-flex; align-items: center; gap: var(--spacing-1); vertical-align: bottom; }
.empty { color: var(--muted-foreground); }
.back { margin: 0 0 var(--spacing-2); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--spacing-2) var(--spacing-4); margin: var(--spacing-4) 0; padding: var(--spacing-4); background: var(--surface); border-radius: var(--rounded-card); box-shadow: var(--e1), 0 0 0 1px var(--line); }
dt { color: var(--muted-foreground); font: var(--weight-meta) var(--font-meta); padding-top: var(--spacing-1); }
dd { margin: 0; font-variant-numeric: tabular-nums; }
.description { white-space: pre-line; max-width: 65ch; }
.actions { display: flex; flex-wrap: wrap; gap: var(--spacing-2); align-items: center; margin: var(--spacing-4) 0; }
.foot { padding-top: var(--spacing-6); padding-bottom: var(--spacing-6); color: var(--muted-foreground); font: var(--weight-meta) var(--font-meta); }
.pill, .button, .link, .card h2 a { touch-action: manipulation; }
@media (max-width: ${LAYOUT.phoneBelow - 1}px) { .filters select, .filters input:not([type="checkbox"]) { width: 100%; } .filters label { flex: 1 1 100%; } }
@media (prefers-reduced-motion: reduce) { .card, .pill, .button, .view-switch a { transition: none; } }
`;
}
