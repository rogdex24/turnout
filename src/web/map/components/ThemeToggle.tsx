import { Moon, Sun, SunMoon } from "lucide-react";
import { useEffect, useState } from "react";
import { nextPreference, type ThemePreference, themeProtocol } from "../../../utils/theme.js";
import { Icon } from "./Icon.js";

const LABEL: Record<ThemePreference, string> = { auto: "Auto", light: "Light", dark: "Dark" };
const GLYPH = { auto: SunMoon, light: Sun, dark: Moon };

/**
 * Cycles Auto, Light, Dark through the shared protocol (utils/theme.ts), writing `data-theme`. Icon only; the label is its
 * accessible name. Hidden until mounted, because without JavaScript the button would do nothing. Tells the map with a
 * `themechange` event.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [preference, setPreference] = useState<ThemePreference>("auto");
  useEffect(() => {
    setPreference(themeProtocol("attribute"));
    setMounted(true);
  }, []);
  return (
    <button
      type="button"
      id="theme-toggle"
      className="theme-toggle pill round"
      hidden={!mounted}
      aria-label={`Theme: ${LABEL[preference]}. Switch theme`}
      onClick={() => {
        setPreference(themeProtocol("attribute", nextPreference(preference)));
        dispatchEvent(new Event("themechange"));
      }}
    >
      <Icon as={GLYPH[preference]} />
    </button>
  );
}
