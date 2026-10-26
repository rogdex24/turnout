import { bootScript } from "../utils/theme.js";

/** The marker `ui/index.html` carries where the pre-paint script goes. */
export const THEME_BOOT_MARKER = '<meta name="theme-boot" content="class" />';

/**
 * Puts the theme's pre-paint script into the admin shell, so a dark admin never flashes light. The script is the shared
 * protocol itself (`bootScript("class")`, src/utils/theme.ts), not a copy of its logic, so stored values, the OS setting and
 * blocked storage give the same result here as in `theme-boot.ts` once the bundle has loaded. Bun serves the shell as a
 * bundled HTML import whose own scripts are deferred modules, which is why the injection happens when the page is served.
 */
export const withThemeBoot = (html: string): string =>
  html.replace(/<meta\s+name="theme-boot"[^>]*>/, `<script>${bootScript("class")}</script>`);
