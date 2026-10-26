import type { LucideIcon } from "lucide-react";
import { LAYOUT } from "../layout.js";

/** A Lucide icon at DESIGN.md's size and stroke (16 px inline, 1.75), decorative. */
export function Icon({ as: Glyph, size = LAYOUT.iconInline }: { as: LucideIcon; size?: number }) {
  return <Glyph className="i" size={size} strokeWidth={LAYOUT.iconStroke} aria-hidden="true" focusable="false" />;
}
