import type { Message } from "@turnout/contract/app/thread";
import { istTime } from "./planTime";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** The same offsets the server uses (src/social/model/threadWindow.ts): the thread opens at T-3h, closes to new messages at T+24h and is gone 30 days after the start. */
const OPENS_BEFORE_START = 3 * HOUR;
const OPEN_FOR_AFTER_START = DAY;
const GONE_AFTER_START = 30 * DAY;

export type ThreadPhase = "waiting" | "open" | "read_only" | "gone";

/** Where the thread is in its life, from the show's start and the phone's clock. The server's answer wins; this decides what to ask for and what to show before it arrives. */
export function threadPhase(startsAt: string, now: number): ThreadPhase {
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return "waiting";
  if (now < start - OPENS_BEFORE_START) return "waiting";
  if (now < start + OPEN_FOR_AFTER_START) return "open";
  return now < start + GONE_AFTER_START ? "read_only" : "gone";
}

/** When the thread stops taking messages, as an instant. Null when the start does not parse. */
export function threadClosesAt(startsAt: string): string | null {
  const start = Date.parse(startsAt);
  return Number.isNaN(start) ? null : new Date(start + OPEN_FOR_AFTER_START).toISOString();
}

/** What the thread screen keeps for a group. `complete` is false for a copy read back from disk, which holds only the newest messages. */
export interface ThreadData {
  messages: Message[];
  thread: "open" | "read_only";
  complete: boolean;
}

/** How many of the newest messages go to disk. */
export const KEPT_ON_DISK = 50;

/** Adds the newer messages to the ones already held. Ids sort by time, so a message already held (by id) is kept once and the list stays in order. */
export function mergeMessages(held: readonly Message[], incoming: readonly Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of held) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The copy that goes to disk: the newest messages only, marked incomplete when older ones were left out so the next load starts over. */
export function clipForDisk(data: ThreadData): ThreadData {
  if (data.messages.length <= KEPT_ON_DISK) return data;
  return { ...data, messages: data.messages.slice(-KEPT_ON_DISK), complete: false };
}

/** A message the person sent that the server has not stored yet. */
export interface PendingMessage {
  clientId: string;
  body: string;
  /** When the person sent it, as an instant. */
  sentAt: string;
  /** `failed` can be tried again; `refused` is the server's final no (the chat closed, the text was refused), so it cannot. */
  status: "sending" | "queued" | "failed" | "refused";
}

export type ItemStatus = "sent" | PendingMessage["status"];

export interface ThreadItem {
  key: string;
  memberRef: string | null;
  /** The sender's first name. "You" is the screen's to say, so the model only knows whether it is the person. */
  firstName: string;
  isYou: boolean;
  body: string;
  /** "4:01 PM", on the Indian clock. */
  time: string;
  status: ItemStatus;
  /** Set for a message that did not go, so a tap can send it again. */
  clientId: string | null;
  /** The first message of a run from one sender: it carries the name and the time. */
  startsRun: boolean;
}

/** Messages from one sender closer together than this read as one run. */
const RUN_GAP_MS = 5 * 60_000;

type Draft = Omit<ThreadItem, "startsRun"> & { sentAt: string };

/** The server's copy of a pending entry: the person's own message, the same text (the send trims it), made at or after the send began. */
const isEntryStored = (entry: PendingMessage, message: Message): boolean =>
  message.isYou && message.body === entry.body && Date.parse(message.createdAt) >= Date.parse(entry.sentAt);

const sender = (item: Draft) => (item.isYou ? "you" : item.memberRef);

/**
 * The thread as the screen draws it, oldest first: the server's messages, then the person's own that have not landed yet. A message
 * leaves `pending` when the server has stored it and the thread has been read again, so it is not drawn twice. Between those two
 * moments (and for a send whose answer was lost, which reads as failed) an entry is also left out when the list already holds the
 * person's message with the same text from the send or later.
 */
export function threadItems(messages: readonly Message[], pending: readonly PendingMessage[], youName: string): ThreadItem[] {
  const unseen = pending.filter((entry) => !messages.some((message) => isEntryStored(entry, message)));
  const drafts: Draft[] = [
    ...messages.map(
      (message): Draft => ({
        key: message.id,
        memberRef: message.memberRef,
        firstName: message.firstName,
        isYou: message.isYou,
        body: message.body,
        time: istTime(message.createdAt),
        status: "sent",
        clientId: null,
        sentAt: message.createdAt,
      }),
    ),
    ...unseen.map(
      (entry): Draft => ({
        key: `pending-${entry.clientId}`,
        memberRef: null,
        firstName: youName,
        isYou: true,
        body: entry.body,
        time: istTime(entry.sentAt),
        status: entry.status,
        clientId: entry.clientId,
        sentAt: entry.sentAt,
      }),
    ),
  ];
  return drafts.map((draft, index) => {
    const { sentAt, ...item } = draft;
    const before = drafts[index - 1];
    const sameRun = before !== undefined && Date.parse(sentAt) - Date.parse(before.sentAt) < RUN_GAP_MS && sender(before) === sender(draft);
    return { ...item, startsRun: !sameRun };
  });
}
