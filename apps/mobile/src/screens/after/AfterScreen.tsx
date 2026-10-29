import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GroupResponse } from "@turnout/contract/app/groups";
import { useSyncExternalStore } from "react";
import { afterQuery, type DownvoteVariables, feedbackMutationKey, markDownvoted } from "@/api/feedback";
import { isRevealed } from "@/api/groups";
import { queryKeys } from "@/api/keys";
import { type Replayable, replayable } from "@/api/mutations";
import { isApiError, pendingRead } from "@/model/apiError";
import { useDeps } from "@/providers/AppProviders";
import { useApi } from "@/providers/hooks";
import { useNow } from "@/providers/useNow";
import { AfterView, type AfterViewState, type MarkStatus } from "./AfterView";

const CLOCK_EVERY_MS = 60_000;
/** The photo links last 5 minutes, so the group is asked for again before they run out. */
const REFRESH_EVERY_MS = 4 * 60_000;

export interface AfterScreenProps {
  groupId: string;
  /** The screen is the one in front. The group is not asked for again while it is not. */
  focused: boolean;
  onBack: () => void;
  /** Opens the report screen for this person. */
  onReport: (groupId: string, memberRef: string) => void;
  /** From the closed state back to the plans. */
  onClosed: () => void;
}

/**
 * After the show on live data. The group is read from the server each time and is not kept on disk, so the faces stay in memory
 * only. "I didn't feel comfortable" is private and idempotent: it is saved with no network and sent when the phone is back.
 */
export function AfterScreen({ groupId, focused, onBack, onReport, onClosed }: AfterScreenProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { connectivity } = useDeps();
  const offline = useSyncExternalStore(connectivity.subscribe, connectivity.isOffline);
  const now = useNow(CLOCK_EVERY_MS);
  const group = useQuery({ ...afterQuery(api, groupId), refetchInterval: focused ? REFRESH_EVERY_MS : false });

  // The send function is registered by key (registerFeedback), so a mark saved offline is sent after a restart.
  const mark = useMutation<void, Error, Replayable<DownvoteVariables>, { before: GroupResponse | undefined }>({
    mutationKey: feedbackMutationKey,
    onMutate: async ({ payload }) => {
      const key = queryKeys.after(groupId);
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<GroupResponse>(key);
      if (before) queryClient.setQueryData(key, markDownvoted(before, payload.memberRef));
      return { before };
    },
    onError: (_error, _variables, saved) => {
      if (saved?.before) queryClient.setQueryData(queryKeys.after(groupId), saved.before);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.after(groupId) }),
  });

  const data = group.data;
  let state: AfterViewState;
  if (group.isError && isApiError(group.error) && group.error.kind === "not_found") {
    state = { status: "closed" };
  } else if (data === undefined) {
    state = pendingRead(group);
  } else if (!isRevealed(data) || data.state !== "done") {
    // The server decides when the group is done (the morning after). The phone's clock is not asked.
    state = { status: "notYet" };
  } else if (data.feedbackOpenUntil !== undefined && now >= Date.parse(data.feedbackOpenUntil)) {
    state = { status: "closed" };
  } else {
    state = {
      status: "ready",
      data: {
        groupId,
        showTitle: data.showSnapshot.title,
        feedbackOpenUntil: data.feedbackOpenUntil ?? null,
        members: data.members.filter((member) => !member.isYou),
        marked: data.downvotedRefs ?? [],
      },
    };
  }

  let sent: MarkStatus = null;
  const memberRef = mark.variables?.payload.memberRef;
  if (memberRef !== undefined) {
    if (mark.isPaused) sent = { memberRef, status: "queued" };
    else if (mark.isPending) sent = { memberRef, status: "sending" };
    else if (mark.isError) sent = { memberRef, status: "failed" };
  }

  return (
    <AfterView
      state={state}
      offline={offline}
      mark={sent}
      onBack={onBack}
      onRetry={() => void group.refetch()}
      onMark={(ref) => mark.mutate(replayable({ groupId, memberRef: ref }))}
      onReport={(ref) => onReport(groupId, ref)}
      onClosed={onClosed}
    />
  );
}
