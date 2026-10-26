/**
 * Source health checks. A scraper almost never crashes, it degrades: the site
 * changes its markup, the selector matches nothing, the fetch still returns 200
 * and the parser still returns a list, just an empty one. Nothing throws, so
 * the run is recorded as a success and reconcileStale delists the source's
 * whole catalogue two runs later.
 *
 * These are pure functions over counts. Reading history and recording verdicts
 * belongs to sync.ts.
 */

/** Runs kept for the rolling comparison. Seven smooths a weekday/weekend swing. */
export const HEALTH_HISTORY_RUNS = 7;

/** A source producing less than this share of its recent median has degraded. */
export const HEALTH_MIN_RATIO = 0.5;

/** Below this, normal week-to-week movement swamps the signal. */
export const HEALTH_MIN_MEDIAN = 4;

export interface SourceHealth {
  healthy: boolean;
  /** Populated only when unhealthy, for sync_run_source.error. */
  reason: string | null;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!; // values is non-empty, so middle is in range
}

/**
 * Judges one source's output against what it produced on its last healthy runs.
 *
 * History holds only healthy runs, so a run of broken ones cannot drag the
 * median down to meet them. A source with no history passes: the first run has
 * nothing to compare against, and refusing to reconcile it would be worse than
 * trusting it.
 */
export function checkSourceHealth(occurrences: number, history: number[]): SourceHealth {
  const healthy: SourceHealth = { healthy: true, reason: null };
  if (history.length === 0) return healthy;

  const expected = median(history);
  if (expected < HEALTH_MIN_MEDIAN) return healthy;

  if (occurrences === 0) {
    return { healthy: false, reason: `produced 0 occurrences, median of last ${history.length} healthy runs is ${expected}` };
  }
  const floor = expected * HEALTH_MIN_RATIO;
  if (occurrences < floor) {
    return { healthy: false, reason: `produced ${occurrences} occurrences, below ${floor} (half the median of ${expected})` };
  }
  return healthy;
}
