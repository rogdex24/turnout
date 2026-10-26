/**
 * The List / Map switch (DESIGN.md, Chrome layout): two links in one pill, the current page marked `aria-current="page"`.
 * Each side's href is passed in, so a page decides what travels across (the shared filters).
 */
export function ViewSwitch({ current, list, map }: { current: "list" | "map"; list: string; map: string }) {
  return (
    <nav className="view-switch" aria-label="View">
      <a href={list} aria-current={current === "list" ? "page" : undefined}>
        List
      </a>
      <a href={map} aria-current={current === "map" ? "page" : undefined}>
        Map
      </a>
    </nav>
  );
}
