/** Browser-safe half of the brand mark (no file access), so the React lockup and the server favicon share one geometry. */
/** The mark's shapes on a 64 unit grid: the tile's corner radius, the moon disc and the disc cut out of it to leave a crescent. */
export const MARK = {
  radius: 19,
  moon: { cx: 31, cy: 33, r: 17 },
  cut: { cx: 40, cy: 25, r: 15 },
} as const;
