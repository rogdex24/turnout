import type { DehydrateOptions } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { clipForDisk, type ThreadData } from "@/model/thread";
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

/**
 * The shows list is an infinite query; only its first page goes to disk, so an offline start does not replay a long scroll. A thread
 * keeps its newest messages only.
 */
export function trimForDisk(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries.map((query) => {
    if (keyStartsWith(query.queryKey, ["thread"])) {
      const data = query.state.data as ThreadData | undefined;
      return data?.messages ? { ...query, state: { ...query.state, data: clipForDisk(data) } } : query;
    }
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

export interface PersisterOptions {
  throttleMs?: number;
  /**
   * The buster to stamp on each write. The provider only reads its own buster once, at start, so a person who signs in during this run
   * would otherwise leave a file stamped for nobody and lose it at the next start.
   */
  buster?: () => string;
  /**
   * Whether anyone is signed in. A write that lands after sign-out (a query that settled late, or a cache event the wipe itself
   * caused) would put the last person's data back on disk, so while this says no, nothing is written.
   */
  signedIn?: () => boolean;
}

/** Writes the cache to the (encrypted) store at most once per `throttleMs`; the last state always lands. */
export function createCachePersister(store: KeyValueStore, { throttleMs = 1000, buster, signedIn }: PersisterOptions = {}): Persister {
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    timer = null;
    if (pending === null) return;
    if (signedIn && !signedIn()) {
      pending = null;
      return;
    }
    const value = trimForDisk(pending);
    if (buster) value.buster = buster();
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
