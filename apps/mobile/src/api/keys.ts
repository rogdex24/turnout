/** Query keys, how long each answer stays fresh, and which ones are written to disk. One place, so a screen cannot invent a key. */
export type QueryKey = readonly unknown[];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const queryKeys = {
  me: () => ["me"] as const,
  config: () => ["config"] as const,
  areas: () => ["areas"] as const,
  showsList: (area: string | null) => ["shows", "list", { area }] as const,
  showDetail: (publicId: string) => ["shows", "detail", publicId] as const,
  plansList: () => ["plans", "list"] as const,
  planDetail: (planId: string) => ["plans", "detail", planId] as const,
  group: (groupId: string) => ["group", groupId] as const,
  thread: (groupId: string) => ["thread", groupId] as const,
  after: (groupId: string) => ["after", groupId] as const,
  blocked: () => ["blocked"] as const,
};

/** How long an answer is fresh, by key prefix. Poll intervals are set by the screen that wants them (me 60 s while the handle check is pending, plan detail 60 s). */
export const STALE_TIMES: readonly { prefix: QueryKey; staleTime: number }[] = [
  { prefix: ["me"], staleTime: 5 * MINUTE },
  { prefix: ["config"], staleTime: HOUR },
  { prefix: ["shows", "list"], staleTime: 5 * MINUTE },
  { prefix: ["shows", "detail"], staleTime: MINUTE },
  { prefix: ["areas"], staleTime: 24 * HOUR },
  { prefix: ["plans", "list"], staleTime: 30_000 },
  { prefix: ["plans", "detail"], staleTime: 30_000 },
  { prefix: ["group"], staleTime: 30_000 },
  { prefix: ["thread"], staleTime: 0 },
  { prefix: ["after"], staleTime: 5 * MINUTE },
  { prefix: ["blocked"], staleTime: 5 * MINUTE },
];

/**
 * Only these are written to disk, so an offline start shows the shows and the person's own state. Everything else (plans, the
 * thread, the after-show screen, the blocked list) is added to this list by the task that builds its screen, with its own rule
 * for what is kept; a key that is not listed is never persisted. The group is kept so the meet card opens with the cafe and the
 * members with no signal at the venue; the cache is emptied at sign-out.
 */
export const PERSISTED_PREFIXES: readonly QueryKey[] = [["me"], ["config"], ["areas"], ["shows", "list"], ["group"]];

export function keyStartsWith(key: QueryKey, prefix: QueryKey): boolean {
  return prefix.length <= key.length && prefix.every((part, index) => part === key[index]);
}

export function isPersistedKey(key: QueryKey): boolean {
  return PERSISTED_PREFIXES.some((prefix) => keyStartsWith(key, prefix));
}
