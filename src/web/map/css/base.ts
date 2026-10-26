/** The page base and the top row (brand, search, List / Map, theme): what both /map with and without JavaScript start from. Written with the DESIGN.md tokens only (tokens.ts); the arrangement is owned by the surface it styles. */
import { chromeCss } from "@web/ui/chrome";

export const baseCss = (): string => `  
* { box-sizing: border-box; }
body.map-page { margin: 0; background: var(--bg); color: var(--ink); font: var(--weight-body) var(--font-body); }
:where(.map-page) a { color: inherit; }
${chromeCss()}
/* The top row: brand, search, List / Map, theme. One wrapping flex row (DESIGN.md, Chrome layout), so nothing overlaps. */
.map-top { display: flex; flex-wrap: wrap; gap: var(--spacing-2); align-items: center; padding: var(--spacing-3) var(--spacing-4); font: var(--weight-control) var(--font-control); }
`;
