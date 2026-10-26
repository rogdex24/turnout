/** Skeleton rows and tiles at final size (DESIGN.md, States: loading). */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the label names the busy region; role=status would turn it into a live region
    <div aria-busy="true" aria-label="Loading events">
      <h2 className="vh inset">
        <span className="skel skel-heading" />
      </h2>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity beyond position
        <div key={i} className="skel-row">
          <span className="thumb skel" />
          <span className="skel-lines">
            <span className="skel" />
            <span className="skel" />
          </span>
        </div>
      ))}
    </div>
  );
}

const SPOTS = [
  [22, 30],
  [38, 52],
  [50, 36],
  [30, 68],
  [60, 60],
  [46, 24],
] as const;

export function SkeletonTiles() {
  return (
    <>
      {SPOTS.map(([x, y]) => (
        <span key={`${x}-${y}`} className="tile skel skel-tile" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
    </>
  );
}
