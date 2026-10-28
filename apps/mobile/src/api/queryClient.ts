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

export function createAppQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: CACHE_MAX_AGE_MS, retry: shouldRetry, refetchOnReconnect: true },
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
