export interface Seed {
  url: string;
  note: string;
}

// OPERATOR: review this list before any live run. The agent starts from these URLs.
// Pilot list: one seed. Communitie is also a Tier A source, so every accepted event
// here should dedupe against an existing row. The earlier ten-seed list is in git history.
export const SEEDS: Seed[] = [
  { url: "https://events.communitie.in/hyderabad", note: "Hyderabad events listing. Follow links to each event page." },
];
