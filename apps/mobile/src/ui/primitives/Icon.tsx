import type { ColorRole } from "@turnout/design-tokens";
import { spacing } from "@turnout/design-tokens";
import type { IconWeight, Icon as PhosphorIcon } from "phosphor-react-native";
import { useColors } from "../theme";

/** Icon sizes in dp, on the spacing steps: 20 inside rows and buttons, 24 for toolbar and row icons. */
const SIZE = { sm: spacing[5], md: spacing[6] } as const;

export type IconTone = Extract<ColorRole, "ink" | "muted" | "signal" | "onPrimary" | "onPhoto">;

export interface IconProps {
  icon: PhosphorIcon;
  size?: keyof typeof SIZE;
  tone?: IconTone;
  /** Regular by default; fill for the active tab and small status marks; bold only inside the live chip. */
  weight?: IconWeight;
}

/** A Phosphor icon in a design-token color. Icons are decoration: the control around one carries the accessible name. */
export function Icon({ icon: Glyph, size = "md", tone = "ink", weight = "regular" }: IconProps) {
  const colors = useColors();
  return <Glyph size={SIZE[size]} color={colors[tone]} weight={weight} />;
}
