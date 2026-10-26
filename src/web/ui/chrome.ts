/**
 * The chrome both the map and the listing pages share: the header lockup, the List / Map switch, the pill, the buttons and the
 * links, written only with the DESIGN.md tokens (the generated block from src/web/map/tokens.ts). Each page prepends
 * the tokens, then this, then its own arrangement.
 */
export const HOVER = "(hover: hover)";
export const hoverTint = "color-mix(in srgb, var(--ink) 4%, var(--surface))";
export const pressTint = "color-mix(in srgb, var(--ink) 8%, var(--surface))";

export function chromeCss(): string {
  return `.i { flex: none; display: block; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
/* The category glyph: its tint mixed toward ink (light) or lifted with icon-lift (dark); the duotone fill follows currentColor (DESIGN.md, Icons). */
.cat-icon { color: color-mix(in srgb, var(--tint, var(--ink)), var(--icon-toward) var(--icon-toward-pct)); }
.muted, .meta { color: var(--muted-foreground); font: var(--weight-meta) var(--font-meta); }
.brand { display: inline-flex; align-items: center; gap: var(--spacing-2); text-decoration: none; color: inherit; }
.brand-mark { flex: none; display: block; }
.brand-word { font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.brand-tonight { color: var(--primary); font-weight: 500; margin-left: 0.2em; }
.brand-link { display: inline-flex; align-items: center; height: var(--control-height); padding: 0 var(--spacing-3) 0 var(--spacing-1); border: 1px solid var(--line); border-radius: var(--rounded-full);
  background: var(--surface); box-shadow: var(--e1); color: var(--ink); text-decoration: none; font: var(--weight-body) var(--font-body); }
.brand-link .brand-mark { width: 28px; height: 28px; }
.view-switch { display: inline-flex; align-items: center; height: var(--view-switch-height); padding: var(--spacing-1); gap: 0; border: 1px solid var(--line); border-radius: var(--rounded-full); background: var(--surface); box-shadow: var(--e1); }
.view-switch a { position: relative; display: inline-flex; align-items: center; height: 100%; padding: 0 var(--spacing-3); border-radius: var(--rounded-full); color: var(--muted-foreground); text-decoration: none; font: var(--weight-control) var(--font-control);
  transition: background-color var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out); }
.view-switch a::before { content: ""; position: absolute; inset: calc((var(--hit) - var(--view-switch-height) + var(--spacing-2)) / -2) 0; }
.view-switch a[aria-current="page"] { background: var(--primary); color: var(--on-primary); }
@media ${HOVER} { .view-switch a:not([aria-current="page"]):hover { color: var(--ink); } }
.theme-toggle { color: var(--ink); }
.link { color: var(--primary); font: var(--weight-control) var(--font-control); text-decoration: none; display: inline-flex; align-items: center; gap: var(--spacing-2); min-height: var(--hit); }
.link:hover { text-decoration: underline; }

.pill { position: relative; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: var(--rounded-full);
  height: var(--pill-height); padding: 0 var(--pill-padding); display: inline-flex; align-items: center; gap: var(--spacing-2);
  font: var(--weight-control) var(--font-control); text-decoration: none; box-shadow: var(--e1); cursor: pointer; white-space: nowrap;
  transition: background-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out); }
@media ${HOVER} { .pill:hover:not(.on):not([aria-current="true"]):not(:disabled) { background: ${hoverTint}; } }
.pill:active:not(.on):not([aria-current="true"]) { background: ${pressTint}; }
.pill:disabled { opacity: .5; cursor: default; }
.pill.on, .pill[aria-current="true"] { background: var(--primary); color: var(--on-primary); border-color: var(--primary); }
.pill[hidden], .theme-toggle svg[hidden] { display: none; }
/* A 36 px control gets a 44 px touch area (DESIGN.md, Components: hit-area). */
/* The pill has a 1 px border and the pseudo-element is placed inside it, so reach one pixel further each way. */
.pill:not(details):not(.search):not(.radius)::before { content: ""; position: absolute; inset: calc((var(--hit) - var(--pill-height)) / -2 - 1px) 0; }
/* A round control (zoom, locate, theme) is 36 by 36, and its hit area is 44 by 44. */
.pill.round { width: var(--pill-height); padding: 0; justify-content: center; }
.pill.round::before { inset: calc((var(--hit) - var(--pill-height)) / -2 - 1px); }
.pill:focus-visible, summary:focus-visible, .button:focus-visible, .link:focus-visible, .row-head:focus-visible, .close:focus-visible, .view-switch a:focus-visible, .brand-link:focus-visible, .trigger:focus-visible, .tile:focus-visible, .cluster:focus-visible, [data-detent]:focus-visible {
  outline: var(--ring-focus) solid var(--primary); outline-offset: var(--ring-offset); }

/* Buttons */
.button { display: inline-flex; align-items: center; justify-content: center; gap: var(--spacing-2); height: var(--button-primary-height); padding: 0 var(--button-primary-padding);
  border-radius: var(--rounded-full); font: var(--weight-control) var(--font-control); text-decoration: none; cursor: pointer; border: 1px solid var(--line); background: var(--surface); color: var(--ink); box-shadow: var(--e1);
  transition: background-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out); }
.button.primary { background: var(--primary); color: var(--on-primary); border-color: var(--primary); box-shadow: none; }
@media ${HOVER} { .button.secondary:hover { background: ${hoverTint}; } .button.primary:hover { background: color-mix(in srgb, var(--ink) 12%, var(--primary)); } }

`;
}
