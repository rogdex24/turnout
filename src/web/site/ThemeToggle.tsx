import { Moon, Sun, SunMoon } from "lucide-react";

/**
 * The theme button of the server-rendered pages: an icon-only round pill, like the map's, with the same three Lucide icons. All
 * three are in the markup and the small script in theme.ts shows the one for the current choice (it only toggles `hidden`), so no
 * markup is ever built from a string. Hidden until the script has run: without JavaScript the button would do nothing.
 */
export function ThemeToggle() {
  const hid = { hidden: true } as object; // SVG props do not list `hidden`; the attribute is real and the script toggles it
  const icon = { size: 16, strokeWidth: 1.75, "aria-hidden": true, focusable: "false" } as const;
  return (
    <button type="button" id="theme-toggle" className="theme-toggle pill round" aria-label="Theme: Auto. Switch theme" hidden>
      <SunMoon className="i" data-theme="auto" {...icon} />
      <Sun className="i" data-theme="light" {...hid} {...icon} />
      <Moon className="i" data-theme="dark" {...hid} {...icon} />
    </button>
  );
}
