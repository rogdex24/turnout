import { bootScript, THEME_ORDER, themeProtocol } from "../utils/theme.js";

/**
 * Light, dark or auto (follow the OS). The protocol is in utils/theme.ts and is
 * shared with the admin; here it writes `data-theme` on <html>, which every
 * public stylesheet keys off. No attribute means auto.
 *
 * The map client listens for the `themechange` event to swap its basemap.
 */

/** In <head>, before any paint, so a stored choice never flashes the other theme. */
export const THEME_BOOT_JS = bootScript("attribute");
export const THEME_BOOT = `<script>${THEME_BOOT_JS}</script>`;

/**
 * At the end of <body>: wires the toggle that site/ThemeToggle.tsx renders and keeps its icon and name in step. It is the only
 * script the listing and detail pages run. Hidden until wired, because without JavaScript the button would do nothing.
 */
export const THEME_TOGGLE_JS = `(()=>{
const b=document.getElementById("theme-toggle");if(!b)return;
const protocol=${themeProtocol.toString()},order=${JSON.stringify(THEME_ORDER)};
const label={auto:"Auto",light:"Light",dark:"Dark"};
const show=(t)=>{b.querySelectorAll("svg").forEach((s)=>s.toggleAttribute("hidden",s.dataset.theme!==t));b.setAttribute("aria-label","Theme: "+label[t]+". Switch theme")};
b.hidden=false;show(protocol("attribute"));
b.addEventListener("click",()=>{show(protocol("attribute",order[(order.indexOf(protocol("attribute"))+1)%order.length]));dispatchEvent(new Event("themechange"))});
})()`;

/** Form controls and scrollbars follow the chosen theme, not only the OS. */
export const THEME_CSS = `:root { color-scheme: light dark; }
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; }
.theme-toggle[hidden] { display: none; }`;
