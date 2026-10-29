import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { MESSAGE_MAX_CHARS, type Message, postMessageRequestSchema } from "@turnout/contract/app/thread";
import { useSyncExternalStore } from "react";
import { groupQuery, isRevealed } from "@/api/groups";
import { type Replayable, replayable } from "@/api/mutations";
import { type ThreadSendVariables, threadQuery, threadSendMutationKey } from "@/api/thread";
import { thread as copy } from "@/copy/thread";
import { errorKind, isApiError } from "@/model/apiError";
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

const notFound = (error: unknown) => isApiError(error) && error.kind === "not_found";
/** A 4xx other than "sign in again" and "slow down": the chat closed, the person is not in it, or the text was refused. A second try gets the same answer. */
const refusedForGood = (error: unknown) =>
  isApiError(error) && (error.kind === "forbidden" || error.kind === "not_found" || error.kind === "validation");

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

  // The group gives the title and the photos, nothing more: the chat is open, read only or closed by what the messages say. A group
  // the server no longer has (404) therefore does not close a chat whose messages are still there.
  const group = useQuery({
    ...groupQuery(api, groupId),
    refetchInterval: (query) => (focused && !notFound(query.state.error) ? GROUP_REFRESH_MS : false),
  });
  const startsAt = group.data?.showSnapshot.startsAt ?? null;
  const phase = startsAt === null ? null : threadPhase(startsAt, now);
  // Without the group the phone cannot tell the phase, so it asks once the group has answered (with data or with an error) and lets
  // the server decide.
  const groupAnswered = group.data !== undefined || group.isError;
  const readable = groupAnswered && phase !== "waiting" && phase !== "gone";

  const messages = useQuery({
    ...threadQuery(api, groupId, queryClient),
    enabled: readable,
    // The server says when the chat has closed (read_only) or is gone (not found); after that there is nothing new to read.
    refetchInterval: (query) =>
      focused && (phase === "open" || phase === null) && query.state.data?.thread !== "read_only" && !notFound(query.state.error)
        ? POLL_EVERY_MS
        : false,
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
      else if (state.status === "error") status = refusedForGood(state.error) ? "refused" : "failed";
      else if (state.isPaused) status = "queued";
      return { clientId: variables.clientId, body: variables.payload.body, sentAt: variables.payload.sentAt, status, variables };
    },
  });
  // A later try with the same client id replaces the earlier one.
  const latest = new Map<string, Send>();
  for (const entry of sends) if (entry !== null && entry.variables.payload.groupId === groupId) latest.set(entry.clientId, entry);
  const pending = [...latest.values()].filter((entry): entry is Send & PendingMessage => entry.status !== "done");

  const revealed = group.data && isRevealed(group.data) ? group.data : null;

  const stalledOffline = (query: { isPending: boolean; fetchStatus: string; failureCount: number }) =>
    query.isPending && query.fetchStatus === "paused" && query.failureCount > 0;
  const messagesGone = messages.isError && notFound(messages.error);

  let state: ThreadViewState;
  if (phase === "waiting" && group.data !== undefined) {
    state = { status: "waiting", opensAt: istShort(group.data.revealAt) };
  } else if (phase === "gone" || (messages.data === undefined && messagesGone)) {
    state = { status: "closed" };
  } else if (messages.data === undefined) {
    if (messages.isError) state = { status: "error", kind: errorKind(messages.error) };
    else if (stalledOffline(messages) || (!groupAnswered && stalledOffline(group))) state = { status: "error", kind: "offline" };
    else state = { status: "loading" };
  } else {
    // A chat the server no longer has (the group was called off) stays readable from what the phone holds, and takes nothing new.
    const readOnly = messages.data.thread === "read_only" || phase === "read_only" || messagesGone;
    const closesAt = startsAt === null ? null : threadClosesAt(startsAt);
    state = {
      status: "ready",
      title: group.data?.showSnapshot.title ?? copy.fallbackTitle,
      closesAt: readOnly || closesAt === null ? null : istShort(closesAt),
      items: threadItems(messages.data.messages, readOnly ? [] : pending, copy.you),
      photos: Object.fromEntries((revealed?.members ?? []).map((member) => [member.memberRef, member.photoUrl])),
      readOnly,
    };
  }

  // The contract's own check runs first, so a message it would refuse never leaves the phone as a request that is sure to fail.
  const sendBody = (body: string): string | null => {
    const variables = replayable({ groupId, body: body.trim(), sentAt: new Date(Date.now()).toISOString() });
    if (!postMessageRequestSchema.safeParse({ body: variables.payload.body, clientId: variables.clientId }).success) {
      return copy.composer.invalid(MESSAGE_MAX_CHARS);
    }
    send.mutate(variables);
    return null;
  };

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
