import { MARK } from "../../../utils/markShape.js";

/**
 * The header lockup: the mark at text height plus "Hyd" and "Tonight" (DESIGN.md, Brand lockup). The mark's two colors are the
 * raw DESIGN.md tokens (not the theme roles), so it looks the same in light and dark, like the favicon.
 */
export function Brand() {
  return (
    <span className="brand" role="img" aria-label="Hyd Tonight">
      <svg className="brand-mark" width={28} height={28} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <rect width="64" height="64" rx={MARK.radius} fill="var(--color-ink)" />
        <mask id="hyd-crescent">
          <rect width="64" height="64" fill="white" />
          <circle {...MARK.cut} fill="black" />
        </mask>
        <circle {...MARK.moon} fill="var(--color-primary-dark)" mask="url(#hyd-crescent)" />
      </svg>
      <span className="brand-word" aria-hidden="true">
        <span className="brand-hyd">Hyd</span>
        <span className="brand-tonight">Tonight</span>
      </span>
    </span>
  );
}
