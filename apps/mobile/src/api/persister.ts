import type { DehydrateOptions } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { isPersistedKey, keyStartsWith } from "./keys";
import type { KeyValueStore } from "./prefs";

export const CACHE_STORE_KEY = "turnout-query-cache";

/** The disk cache is only valid for this app version and this person. A different build or a different account starts empty. */
export function cacheBuster(appVersion: string, userId: string | null): string {
  return `${appVersion}:${userId ?? "none"}`;
}

/** Replayable mutations are stored with their variables so a restart can send them again. Success and failure are not. */
export const REPLAYABLE_MUTATION_KEYS = ["checkin", "thread-send", "feedback", "report"] as const;

export const dehydrateOptions: DehydrateOptions = {
  shouldDehydrateQuery: (query) => query.state.status === "success" && isPersistedKey(query.queryKey),
  shouldDehydrateMutation: (mutation) =>
    mutation.state.status === "pending" &&
    mutation.state.isPaused &&
    REPLAYABLE_MUTATION_KEYS.some((name) => mutation.options.mutationKey?.[0] === name),
};

/** The shows list is an infinite query; only its first page goes to disk, so an offline start does not replay a long scroll. */
export function trimForDisk(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries.map((query) => {
    if (!keyStartsWith(query.queryKey, ["shows", "list"])) return query;
    const data = query.state.data as { pages?: unknown[]; pageParams?: unknown[] } | undefined;
    if (!data?.pages) return query;
    return {
      ...query,
      state: { ...query.state, data: { pages: data.pages.slice(0, 1), pageParams: (data.pageParams ?? []).slice(0, 1) } },
    };
  });
  return { ...client, clientState: { ...client.clientState, queries } };
}

/** Writes the cache to the (encrypted) store at most once per `throttleMs`; the last state always lands. */
export function createCachePersister(store: KeyValueStore, throttleMs = 1000): Persister {
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    timer = null;
    if (pending === null) return;
    const value = trimForDisk(pending);
    pending = null;
    store.set(CACHE_STORE_KEY, JSON.stringify(value));
  }

  return {
    persistClient(client) {
      pending = client;
      if (timer === null) timer = setTimeout(flush, throttleMs);
    },
    restoreClient() {
      const raw = store.getString(CACHE_STORE_KEY);
      if (raw === undefined) return undefined;
      try {
        return JSON.parse(raw) as PersistedClient;
      } catch {
        store.remove(CACHE_STORE_KEY);
        return undefined;
      }
    },
    removeClient() {
      pending = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      store.remove(CACHE_STORE_KEY);
    },
  };
}
