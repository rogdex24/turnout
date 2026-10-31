import type { QueryClient } from "@tanstack/react-query";
import {
  MESSAGE_PAGE,
  type Message,
  type MessageListResponse,
  messageListResponseSchema,
  messageSchema,
} from "@turnout/contract/app/thread";
import { mergeMessages, type ThreadData } from "@/model/thread";
import type { ApiClient } from "./client";
import { queryKeys } from "./keys";
import { mutationKey, type Replayable, registerReplayable } from "./mutations";
import { retryTransient } from "./retry";

/** A thread of 2,000 messages is more than a group writes in a day; the loop stops there rather than run for ever. */
const MAX_PAGES = 20;

export function fetchMessages(api: ApiClient, groupId: string, after: string | undefined): Promise<MessageListResponse> {
  return api.request({
    path: `/groups/${encodeURIComponent(groupId)}/messages`,
    query: { after },
    schema: messageListResponseSchema,
  });
}

/**
 * The thread so far plus whatever came after it. The last id read is the cursor, so a poll only carries new messages. A copy read
 * back from disk holds the newest messages only (`complete` is false), so it is read again from the start.
 */
export async function fetchThread(api: ApiClient, groupId: string, held: ThreadData | undefined): Promise<ThreadData> {
  let messages: Message[] = held?.complete ? held.messages : [];
  let thread: ThreadData["thread"] = held?.thread ?? "open";
  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await fetchMessages(api, groupId, messages.at(-1)?.id);
    messages = mergeMessages(messages, answer.messages);
    thread = answer.thread;
    if (answer.messages.length < MESSAGE_PAGE) break;
  }
  return { messages, thread, complete: true };
}

/** The thread of one group. Fresh for no time at all: the screen polls it every 5 s while it is focused (see ThreadScreen). */
export const threadQuery = (api: ApiClient, groupId: string, queryClient: QueryClient) => ({
  queryKey: queryKeys.thread(groupId),
  queryFn: () => fetchThread(api, groupId, queryClient.getQueryData<ThreadData>(queryKeys.thread(groupId))),
});

export interface ThreadSendVariables {
  groupId: string;
  body: string;
  /** When the person pressed send, so a message saved offline keeps its place and its time in the thread. */
  sentAt: string;
}

/** POST /groups/:groupId/messages. The same `clientId` sent twice stores one message and answers with it. */
export function sendMessage(api: ApiClient) {
  return ({ clientId, payload }: Replayable<ThreadSendVariables>): Promise<Message> =>
    api.request({
      method: "POST",
      path: `/groups/${encodeURIComponent(payload.groupId)}/messages`,
      body: { body: payload.body, clientId },
      schema: messageSchema,
    });
}

export const threadSendMutationKey = mutationKey("thread-send");

/**
 * Lets a message written without a network be sent after a restart, once the phone is back online. When one lands, the thread is
 * read again before the send counts as done, so the message goes from "sending" to a stored one with no gap between them.
 */
export function registerThreadSend(queryClient: QueryClient, api: ApiClient): void {
  registerReplayable<ThreadSendVariables>(queryClient, "thread-send", sendMessage(api), retryTransient);
  queryClient.setMutationDefaults(threadSendMutationKey, {
    ...queryClient.getMutationDefaults(threadSendMutationKey),
    onSuccess: (_message: Message, { payload }: Replayable<ThreadSendVariables>) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.thread(payload.groupId) }),
  });
}
