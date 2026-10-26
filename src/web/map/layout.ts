/**
 * Numbers that DESIGN.md states in prose (Layout, Elevation & Depth, Components,
 * Images) rather than in its front matter, so the token exporters cannot carry
 * them. Each group names the section it comes from. Pure data: the server turns
 * it into CSS custom properties and the browser reads it for camera rules.
 */
export const LAYOUT = {
  // Layout: breakpoints and frame
  phoneBelow: 720,
  wideFrom: 1280,
  frameInset: 12,
  cardEdge: 12,
  cameraGap: 24,
  // Layout: sheet detents (peek px, half dvh, full is 100dvh minus fullInset px)
  sheetPeek: 120,
  sheetHalfDvh: 50,
  sheetFullInset: 104,
  // Layout: zoom
  zoom: { min: 10, default: 11.5, max: 18, selectMin: 13, selectMax: 14, focus: 15, poiHideBelow: 16 },
  // Components
  tileGlyph: 20,
  /** DESIGN.md, Icons: the category icon's side per place. `test/mapTokens.test.ts` pins `tile` to the `category-icon` size. */
  categoryIcon: { tile: 22, thumb: 28, cover: 40, heading: 18, meta: 14, inline: 16 },
  /** DESIGN.md, Icons: the share of ink (light) or icon-lift (dark) mixed into the tint for a category glyph. */
  iconTowardPct: { light: 30, dark: 20 },
  /** Images: the thumbnail's side and the cover's box (16:9 at the wide card's width). `test/mapTokens.test.ts` pins these to DESIGN.md. */
  image: { thumb: 56, coverWidth: 400, coverHeight: 225 },
  searchIcon: 18,
  searchIconInset: 14,
  posterBlur: 24,
  posterDim: 50,
  iconInline: 16,
  iconStroke: 1.75,
  badgeMinWidth: 18,
  badgePadX: 5,
  badgeOffset: 7,
  labelMax: 160,
  labelGap: 6,
  labelZoom: 14,
  clusterRadius: 50,
  clusterMaxZoom: 13,
  stackOffset: 6,
  stackMax: 3,
  /** DESIGN.md, Distance slider: Near me radius in km. */
  nearKm: { min: 1, max: 25, step: 1, default: 4, frameMargin: 80 },
  /** DESIGN.md, Distance slider: the circle drawn for the radius. */
  nearRing: { fillOpacity: 0.04, edgeOpacity: 0.45, edgeWidth: 1.25, dash: [3, 3] },
  /** DESIGN.md, Marker tile: category tint mixed into surface at the top of the tile fade. */
  tileTintPct: { light: 18, dark: 28 },
  selectedRing: 3,
  focusRing: 2,
  focusOffset: 2,
  handle: { width: 36, height: 4, radius: 2, top: 8 },
  glassBlur: 8,
  // Elevation & Depth: alpha (percent) of each shadow layer. e1 is contact only; e3 mixes ink instead of shadow.
  elevation: { e1: 5, e2Contact: 10, e2Ambient: 10, e3: 12, chip: 20, darkAlpha: 53 },
  // Images: ink mixed into surface, percent, for the six placeholder steps
  placeholderSteps: [5, 8, 11, 14, 17, 20],
  skeletonBase: 2,
  skeletonSweep: 4,
  // Elevation & Depth: motion in milliseconds
  motion: { fast: 150, base: 250, camera: 400, ease: "cubic-bezier(.2,.8,.2,1)" },
  // States: longest a skeleton shows
  skeletonMaxMs: 1500,
} as const;
