/**
 * Time is always passed in, never read inline, so the ticker, the rate limits and the staging clock route
 * can all be driven from tests. `Clock` has the same shape as the site's `NowFn`.
 */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

/** A clock fixed at one instant, for tests. `advance` moves it forward. */
export interface FixedClock extends Clock {
  set(to: Date | string): void;
  advance(ms: number): void;
}

export function fixedClock(start: Date | string): FixedClock {
  let current = new Date(start).getTime();
  const clock = (() => new Date(current)) as FixedClock;
  clock.set = (to) => {
    current = new Date(to).getTime();
  };
  clock.advance = (ms) => {
    current += ms;
  };
  return clock;
}

/**
 * The staging server's clock: the real clock plus an offset, so a test can jump to T-3h and let time carry on.
 * Only the staging test route moves it. Production never builds one.
 */
export interface AdjustableClock extends Clock {
  /** Jump so that `now()` reads `to` at this moment. */
  set(to: Date | string): void;
  advance(ms: number): void;
  reset(): void;
  offsetMs(): number;
}

export function adjustableClock(base: Clock = systemClock): AdjustableClock {
  let offset = 0;
  const clock = (() => new Date(base().getTime() + offset)) as AdjustableClock;
  clock.set = (to) => {
    offset = new Date(to).getTime() - base().getTime();
  };
  clock.advance = (ms) => {
    offset += ms;
  };
  clock.reset = () => {
    offset = 0;
  };
  clock.offsetMs = () => offset;
  return clock;
}
