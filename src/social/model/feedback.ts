import { milestones } from "./schedule.js";
import { DEFAULT_TUNABLES, type Tunables } from "./tunables.js";

/**
 * Whether a downvote can be given now. It opens when the group is done (the morning after the show) and closes at
 * `feedbackClosesAt`, 72 hours later. Each boundary instant counts as the later side.
 */
export type FeedbackWindow = "not_open" | "open" | "closed";

export function feedbackWindow(group: { startsAt: string; state: string }, now: Date, t: Tunables = DEFAULT_TUNABLES): FeedbackWindow {
  if (group.state !== "done") return "not_open";
  return now.getTime() < Date.parse(milestones(group.startsAt, t).feedbackClosesAt) ? "open" : "closed";
}

/** One downvote, with the show it was given for. */
export interface VoteFacts {
  voterId: string;
  showId: string;
}

/** The stop rule: votes from `voters` different people at `shows` different shows. Counting both, not a vote per pair. */
export function stopRuleReached(votes: readonly VoteFacts[], t: Tunables = DEFAULT_TUNABLES): boolean {
  const voters = new Set(votes.map((v) => v.voterId));
  const shows = new Set(votes.map((v) => v.showId));
  return voters.size >= t.stopRule.voters && shows.size >= t.stopRule.shows;
}

/**
 * The pairs who met: both checked in. A group where anyone was downvoted or reported has none, since one bad moment in the group
 * means nobody there should be matched on the strength of it. Each pair is sorted, so `[a, b]` has `a < b`.
 */
export function metPairs(members: readonly { memberId: string; checkedIn: boolean }[], flagged: boolean): [string, string][] {
  if (flagged) return [];
  const present = members
    .filter((m) => m.checkedIn)
    .map((m) => m.memberId)
    .sort();
  const pairs: [string, string][] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) pairs.push([present[i] as string, present[j] as string]);
  }
  return pairs;
}
