/**
 * The filters the listing and the map have in common, and the link from each to the other. Category, area and free travel
 * across; the rest (dates, price, source on the listing; the window, search, grouping and selection on the map) belong to
 * one side. The listing writes `free=true` and the map `free=1`; each side reads both.
 */
export interface SharedFilters {
  category: string | null;
  area: string | null;
  free: boolean;
}

const query = (pairs: Array<[string, string | null]>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of pairs) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

/** The listing for these filters. */
export const listHref = ({ category, area, free }: SharedFilters): string =>
  `/${query([
    ["category", category],
    ["area", area],
    ["free", free ? "true" : null],
  ])}`;

/** The map for these filters. */
export const mapHref = ({ category, area, free }: SharedFilters): string =>
  `/map${query([
    ["category", category],
    ["area", area],
    ["free", free ? "1" : null],
  ])}`;
