import { Moon, Sun, SunMoon } from "lucide-react";
import { useState } from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { nextPreference, type ThemePreference, themeProtocol } from "../../../utils/theme";

const LABEL: Record<ThemePreference, string> = { auto: "Theme: Auto", light: "Theme: Light", dark: "Theme: Dark" };
const ICON = { auto: SunMoon, light: Sun, dark: Moon };

/** Cycles Auto, Light, Dark through the shared protocol in src/utils/theme.ts (this side writes the `.dark` class). */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemePreference>(() => themeProtocol("class"));
  const Icon = ICON[choice];
  return (
    <SidebarMenuButton
      onClick={() => setChoice(themeProtocol("class", nextPreference(choice)))}
      aria-label={`${LABEL[choice]}. Switch theme`}
    >
      <Icon />
      {LABEL[choice]}
    </SidebarMenuButton>
  );
}
