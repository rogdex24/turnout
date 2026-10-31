import { type BlockedResponse, blockedResponseSchema } from "@turnout/contract/app/feedback";
import type { ApiClient } from "./client";
import { queryKeys } from "./keys";

export function fetchBlocked(api: ApiClient): Promise<BlockedResponse> {
  return api.request({ path: "/me/blocked", schema: blockedResponseSchema });
}

/** The people this member downvoted or reported. View only, and kept in memory only (first names are not written to the disk cache). */
export const blockedQuery = (api: ApiClient) => ({ queryKey: queryKeys.blocked(), queryFn: () => fetchBlocked(api) });
