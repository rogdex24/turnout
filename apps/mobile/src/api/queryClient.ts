import { onlineManager, QueryClient } from "@tanstack/react-query";
import { isApiError } from "../model/apiError";
import type { Connectivity } from "./connectivity";
import { STALE_TIMES } from "./keys";

/** Kept in memory at least as long as the disk cache is kept, or a restored query would be collected the moment it loads. */
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Offline and server errors are worth another go; a 4xx will answer the same way again. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  return isApiError(error) && (error.kind === "server" || error.kind === "offline");
}

/**
 * A query sends its first request even while the client says offline, and only its retries wait for the network. The online
 * state comes only from the API client's last answer, so a query that never sent would never tell the app it is back. Screens
 * still see `paused` after that first failure. Mutations wait for an answer.
 */
export function createAppQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: CACHE_MAX_AGE_MS, retry: shouldRetry, refetchOnReconnect: true, networkMode: "offlineFirst" },
      mutations: { gcTime: CACHE_MAX_AGE_MS, retry: 0 },
    },
  });
  for (const { prefix, staleTime } of STALE_TIMES) client.setQueryDefaults(prefix, { staleTime });
  return client;
}

/** The client's own view of the network follows the API client's: a failed call pauses mutations, any answer resumes them. */
export function followConnectivity(connectivity: Connectivity, queryClient: QueryClient): () => void {
  onlineManager.setOnline(!connectivity.isOffline());
  return connectivity.subscribe(() => {
    onlineManager.setOnline(!connectivity.isOffline());
    if (!connectivity.isOffline()) void queryClient.resumePausedMutations();
  });
}
