import { isApiError } from "@/model/apiError";

/**
 * Whether a replayable send is tried again. A refusal (outside the window, not in the group) will not change on a second try, so only a
 * bad connection or a busy server is retried, three times.
 */
export function retryTransient(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  return !isApiError(error) || error.kind === "offline" || error.kind === "server" || error.kind === "rate_limited";
}
