import { iconCategory } from "../../../catalog/category.js";
import { CATEGORY_SPRITE_URL } from "../../icons/spriteUrl.js";
import { LAYOUT } from "../layout.js";
import { humanize } from "../model/format.js";

/**
 * The category's Phosphor duotone icon, drawn from the static sprite (DESIGN.md, Icons), so no glyph is in the JavaScript bundle.
 * It sets its own `--tint`; the stylesheet turns that into the glyph colour. Decorative: the word beside it carries the meaning.
 */
export function CategoryIcon({ category, size = LAYOUT.categoryIcon.inline }: { category: string; size?: number }) {
  const known = iconCategory(category);
  return (
    <svg
      className="i cat-icon"
      style={{ "--tint": `var(--tint-${known})` } as React.CSSProperties}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`${CATEGORY_SPRITE_URL}#${known}`} />
    </svg>
  );
}

/** The icon and the word. */
export function CategoryTag({ category, size = LAYOUT.categoryIcon.meta }: { category: string; size?: number }) {
  return (
    <span className="m-cat">
      <CategoryIcon category={category} size={size} />
      {humanize(category)}
    </span>
  );
}
