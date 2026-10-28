/** Every user-facing string lives under src/copy. The Shows tab. */
export const home = {
  wordmark: "Turnout",
  city: "Hyderabad",
  title: "Shows coming up",
  areas: { label: "Area", all: "All areas" },
  days: {
    today: "Tonight",
    tomorrow: "Tomorrow",
    shows: (count: number) => (count === 1 ? "1 show" : `${count} shows`),
  },
  from: "From",
  /** What a screen reader hears for a show card: title, category, time, place, price. */
  cardLabel: (parts: { title: string; category: string; when: string; place: string | null; price: string | null }) =>
    [
      `${parts.title}, ${parts.category}.`,
      `${parts.when}${parts.place ? ` at ${parts.place}` : ""}.`,
      parts.price ? `${parts.price}.` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" "),
  empty: {
    title: "No shows here yet",
    body: "New shows are added every day. Check back soon.",
    areaBody: "Nothing in this area right now. Try another area.",
    allAreas: "Show all areas",
  },
  more: { loading: "Loading more shows", failed: "We couldn't load more shows.", retry: "Try again" },
  planBar: {
    label: (title: string, when: string, status: string) => `Your plan, ${title}, ${when}. ${status}.`,
  },
} as const;
