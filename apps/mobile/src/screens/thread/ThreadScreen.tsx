import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@turnout/contract/app/thread";
import { useSyncExternalStore } from "react";
import { groupQuery, isRevealed } from "@/api/groups";
import { type Replayable, replayable } from "@/api/mutations";
import { type ThreadSendVariables, threadQuery, threadSendMutationKey } from "@/api/thread";
import { thread as copy } from "@/copy/thread";
import { isApiError } from "@/model/apiError";
import { istShort } from "@/model/planTime";
import { type PendingMessage, threadClosesAt, threadItems, threadPhase } from "@/model/thread";
import { useDeps } from "@/providers/AppProviders";
import { useApi } from "@/providers/hooks";
import { useHoldThreadPushes } from "@/providers/useNotificationRouting";
import { useNow } from "@/providers/useNow";
import { ThreadView, type ThreadViewState } from "./ThreadView";

/** How often the chat is read again while it is in front. */
export const POLL_EVERY_MS = 5000;
const CLOCK_EVERY_MS = 30_000;
const GROUP_REFRESH_MS = 30_000;

export interface ThreadScreenProps {
  groupId: string;
  /** The chat is the screen in front. It is polled, and its push notices are held, only while this is true. */
  focused: boolean;
  onBack: () => void;
  /** Opens the report form for someone else's message. */
  onReport: (target: { memberRef: string; messageId: string }) => void;
  /** From the closed chat back to the plans. */
  onClosed: () => void;
}

/** One try at sending. `done` is a try the server has stored: it hides an earlier failed try of the same message. */
type Send = Omit<PendingMessage, "status"> & { status: PendingMessage["status"] | "done"; variables: Replayable<ThreadSendVariables> };

function errorKind(error: unknown): "offline" | "server" | "rate_limited" | "other" {
  if (!isApiError(error)) return "other";
  if (error.kind === "offline" || error.kind === "server" || error.kind === "rate_limited") return error.kind;
  return "other";
}

const notFound = (error: unknown) => isApiError(error) && error.kind === "not_found";

/**
 * The group chat on live data. Messages read once are kept on disk (the newest 50), so the chat opens with something to read when the
 * phone has no signal. A message the person writes shows at once as "sending", "queued" (no network, it goes when the phone is back
 * online, even after a restart) or "failed" (the server refused it, tap to send again). The same client id is used for every try, so a
 * message that went but whose answer was lost is stored once.
 */
export function ThreadScreen({ groupId, focused, onBack, onReport, onClosed }: ThreadScreenProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { connectivity } = useDeps();
  const offline = useSyncExternalStore(connectivity.subscribe, connectivity.isOffline);
  const now = useNow(CLOCK_EVERY_MS);
  useHoldThreadPushes(focused ? groupId : null);

  const group = useQuery({ ...groupQuery(api, groupId), refetchInterval: focused ? GROUP_REFRESH_MS : false });
  const startsAt = group.data?.showSnapshot.startsAt ?? null;
  const phase = startsAt === null ? null : threadPhase(startsAt, now);
  const readable = phase === "open" || phase === "read_only";

  const messages = useQuery({
    ...threadQuery(api, groupId, queryClient),
    enabled: readable,
    // The server says when the chat has closed (read_only) or is gone (not found); after that there is nothing new to read.
    refetchInterval: (query) =>
      focused && phase === "open" && query.state.data?.thread !== "read_only" && !notFound(query.state.error) ? POLL_EVERY_MS : false,
  });

  // The send function is registered by key (registerThreadSend), so a message saved offline can be sent again after a restart.
  const send = useMutation<Message, Error, Replayable<ThreadSendVariables>>({ mutationKey: threadSendMutationKey });
  const sends = useMutationState<Send | null>({
    filters: { mutationKey: threadSendMutationKey },
    select: ({ state }) => {
      const variables = state.variables as Replayable<ThreadSendVariables> | undefined;
      if (!variables || state.status === "idle") return null;
      let status: Send["status"] = "sending";
      if (state.status === "success") status = "done";
      else if (state.status === "error") status = "failed";
      else if (state.isPaused) status = "queued";
      return { clientId: variables.clientId, body: variables.payload.body, sentAt: variables.payload.sentAt, status, variables };
    },
  });
  // A later try with the same client id replaces the earlier one.
  const latest = new Map<string, Send>();
  for (const entry of sends) if (entry !== null && entry.variables.payload.groupId === groupId) latest.set(entry.clientId, entry);
  const pending = [...latest.values()].filter((entry): entry is Send & PendingMessage => entry.status !== "done");

  const revealed = group.data && isRevealed(group.data) ? group.data : null;

  let state: ThreadViewState;
  if (group.isError && notFound(group.error)) {
    state = { status: "closed" };
  } else if (group.data === undefined) {
    const stalledOffline = group.isPending && group.fetchStatus === "paused" && group.failureCount > 0;
    state =
      group.isError || stalledOffline
        ? { status: "error", kind: stalledOffline ? "offline" : errorKind(group.error) }
        : { status: "loading" };
  } else if (phase === "waiting") {
    state = { status: "waiting", opensAt: istShort(group.data.revealAt) };
  } else if (phase === "gone" || (messages.data === undefined && messages.isError && notFound(messages.error))) {
    state = { status: "closed" };
  } else if (messages.data === undefined) {
    const stalledOffline = messages.isPending && messages.fetchStatus === "paused" && messages.failureCount > 0;
    state =
      messages.isError || stalledOffline
        ? { status: "error", kind: stalledOffline ? "offline" : errorKind(messages.error) }
        : { status: "loading" };
  } else {
    // A chat the server no longer has (the group was called off) stays readable from what the phone holds, and takes nothing new.
    const readOnly = messages.data.thread === "read_only" || phase === "read_only" || (messages.isError && notFound(messages.error));
    const closesAt = threadClosesAt(group.data.showSnapshot.startsAt);
    state = {
      status: "ready",
      title: group.data.showSnapshot.title,
      closesAt: readOnly || closesAt === null ? null : istShort(closesAt),
      items: threadItems(messages.data.messages, readOnly ? [] : pending, copy.you),
      photos: Object.fromEntries((revealed?.members ?? []).map((member) => [member.memberRef, member.photoUrl])),
      readOnly,
    };
  }

  const sendBody = (body: string) => send.mutate(replayable({ groupId, body: body.trim(), sentAt: new Date(Date.now()).toISOString() }));

  return (
    <ThreadView
      state={state}
      offline={offline}
      onBack={onBack}
      onRetry={() => {
        void group.refetch();
        if (readable) void messages.refetch();
      }}
      onSend={sendBody}
      onResend={(clientId) => {
        const entry = latest.get(clientId);
        if (entry) send.mutate(entry.variables);
      }}
      onReport={(item) => {
        if (item.memberRef) onReport({ memberRef: item.memberRef, messageId: item.key });
      }}
      onClosed={onClosed}
    />
  );
}
