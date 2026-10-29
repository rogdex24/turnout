import { milestones } from "./schedule.js";
import { DEFAULT_TUNABLES, type Tunables } from "./tunables.js";

/**
 * Where a group's thread is in its life. `before` is until T-3h and `gone` is from the show plus 30 days; in between it is open
 * until T+24h and read-only after. Each boundary instant counts as the later side.
 */
export type ThreadWindow = "before" | "open" | "read_only" | "gone";

/** A group that was dissolved or called off has no thread at any time. */
const NO_THREAD = ["dissolved", "called_off"] as const;

export function threadWindow(group: { startsAt: string; state: string }, now: Date, t: Tunables = DEFAULT_TUNABLES): ThreadWindow {
  if ((NO_THREAD as readonly string[]).includes(group.state)) return "gone";
  const m = milestones(group.startsAt, t);
  const at = now.getTime();
  if (at < Date.parse(m.revealAt)) return "before";
  if (at < Date.parse(m.threadClosesAt)) return "open";
  if (at < Date.parse(m.messagesGoneAt)) return "read_only";
  return "gone";
}

/** Reading is allowed while the thread is open or read-only. */
export const canReadThread = (window: ThreadWindow): boolean => window === "open" || window === "read_only";

/** Posting is allowed only while the thread is open. */
export const canPostThread = (window: ThreadWindow): boolean => window === "open";
