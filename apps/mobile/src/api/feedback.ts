import type { QueryClient } from "@tanstack/react-query";
import type { GroupResponse } from "@turnout/contract/app/groups";
import { z } from "zod";
import type { ApiClient } from "./client";
import { fetchGroup, isRevealed } from "./groups";
import { queryKeys } from "./keys";
import { mutationKey, type Replayable, registerReplayable } from "./mutations";
import { retryTransient } from "./retry";

/** How long the faces stay in memory once nothing on screen uses them. */
export const AFTER_GC_MS = 5 * 60_000;

/**
 * The group after the show. The same answer as the meet card, under its own key so it is not kept on disk: the faces of the people
 * a person went with stay in memory only, and are gone when the screen has been left for a few minutes.
 */
export const afterQuery = (api: ApiClient, groupId: string) => ({
  queryKey: queryKeys.after(groupId),
  queryFn: () => fetchGroup(api, groupId),
  gcTime: AFTER_GC_MS,
});

export interface DownvoteVariables {
  groupId: string;
  memberRef: string;
}

/** POST /groups/:groupId/downvotes. Private, and the answer is 204 both the first time and on a repeat. */
export function sendDownvote(api: ApiClient) {
  return ({ payload }: Replayable<DownvoteVariables>): Promise<void> =>
    api.request({
      method: "POST",
      path: `/groups/${encodeURIComponent(payload.groupId)}/downvotes`,
      body: { memberRef: payload.memberRef },
      schema: z.void(),
    });
}

/** Lets a mark made with no signal be sent after a restart, once the phone is back online. */
export function registerFeedback(queryClient: QueryClient, api: ApiClient): void {
  registerReplayable<DownvoteVariables>(queryClient, "feedback", sendDownvote(api), retryTransient);
}

export const feedbackMutationKey = mutationKey("feedback");

/** The group with this member added to the ones the person has marked, so the screen shows it before the next fetch. */
export function markDownvoted(group: GroupResponse, memberRef: string): GroupResponse {
  if (!isRevealed(group)) return group;
  const marked = group.downvotedRefs ?? [];
  return marked.includes(memberRef) ? group : { ...group, downvotedRefs: [...marked, memberRef] };
}
