/** The filter row: pills, the search pill, the Filters popover and its fields, buttons, the count and the control column. Written with the DESIGN.md tokens only (tokens.ts); the arrangement is owned by the surface it styles. */

export const filtersCss = (): string => `/* Pills */
.pills { display: flex; flex-wrap: wrap; gap: var(--spacing-2); padding: 0 var(--spacing-4) var(--spacing-3); align-items: center; }
.map-controls[hidden] { display: none; }
.presets { display: contents; }
.pill.radius { gap: var(--spacing-2); cursor: default; }
.pill.radius .radius-slider { width: 112px; }
.pill.radius output { font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 9ch; }
.pill.search { padding: 0; height: var(--search-pill-height); cursor: text; }
.pill.search .lead { position: absolute; left: var(--search-inset); top: 50%; transform: translateY(-50%); color: var(--muted-foreground); display: grid; pointer-events: none; }
.pill.search input { font: var(--weight-body) var(--font-body); border: 0; background: transparent; color: inherit; height: 100%; outline: none;
  padding: 0 var(--pill-padding) 0 calc(var(--search-inset) + var(--search-icon) + var(--spacing-2)); width: calc(var(--spacing-8) * 6); border-radius: var(--rounded-full); }
/* A 36 px field gets a 44 px hit area (DESIGN.md, Components): the input itself is taller than the pill and sits centred in it. */
.pill.search input { height: var(--hit); margin: calc((var(--pill-height) - var(--hit)) / 2) 0; }
.pill.search:focus-within { outline: var(--ring-focus) solid var(--primary); outline-offset: var(--ring-offset); }
.pill.search .clear { display: grid; place-items: center; width: var(--hit); height: var(--hit); color: var(--muted-foreground); margin-right: calc((var(--search-pill-height) - var(--hit)) / 2); }
details.pill.filters { padding: 0; }
.pill.filters summary { padding: 0 var(--pill-padding); cursor: pointer; list-style: none; height: 100%; display: inline-flex; align-items: center; gap: var(--spacing-2); border-radius: var(--rounded-full); }
.pill.filters summary::-webkit-details-marker { display: none; }
.pill.filters form { position: absolute; top: calc(100% + var(--spacing-2)); left: 0; z-index: 5; background: var(--surface); color: var(--ink);
  border: 1px solid var(--line); border-radius: var(--rounded-card); box-shadow: var(--e3); padding: var(--spacing-4); display: grid; gap: var(--spacing-3); min-width: calc(var(--spacing-8) * 7); }
.filters-popover { min-width: calc(var(--spacing-8) * 8); }
/* A field is a 36 px control (the same as every other); its label (caption plus control plus 4 px above and below) is the 44 px target. */
.filters-popover label, .pill.filters label { display: grid; gap: var(--spacing-1); padding-block: var(--spacing-1); font: var(--weight-meta) var(--font-meta); }
.pill.filters select, .filters-popover select { height: var(--control-height); font: var(--weight-body) var(--font-body); padding: 0 var(--spacing-2); border-radius: var(--rounded-sm); border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
.filters-popover .link { min-height: var(--hit); }
.filters-popover select:focus-visible, .filters-popover [data-slot="combobox-input"]:focus-visible, .filters-popover [data-slot="combobox-trigger"]:focus-visible, .detents button:focus-visible, .sheet-handle:focus-visible {
  outline: var(--ring-focus) solid var(--primary); outline-offset: var(--ring-offset); }
.count { padding: 0 var(--spacing-4) var(--spacing-2); font: var(--weight-control) var(--font-control); font-variant-numeric: tabular-nums; }
.map-controls { display: flex; flex-direction: column; gap: var(--spacing-2); }
.attribution { padding: 0 var(--spacing-4) var(--spacing-6); }
#map { display: none; }

`;
