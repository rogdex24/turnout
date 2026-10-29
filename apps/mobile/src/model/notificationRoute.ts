import { type NoticeKind, type PushPayload, pushPayloadSchema } from "@turnout/contract/app/notices";
import { z } from "zod";

/**
 * What a notification tap is allowed to open. The payload names a kind, never a path, and each kind maps to a fixed route here, so
 * nothing a sender writes can open a screen that is not in this list. An id is used only as one path segment, after it is encoded.
 */
const HOME = "/";

/** The contract's payload shape without its `strict`: the push service adds fields of its own, which are dropped and never read. */
const readablePayload = z.object(pushPayloadSchema.shape);

/** The payload of a push or a notification response, or null when it is not one of ours. */
export function parsePushData(data: unknown): PushPayload | null {
  const parsed = readablePayload.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The kinds that open a group screen, so the group id (which the push does not carry) is read from the notice. */
export function needsGroupId(kind: NoticeKind): boolean {
  return kind === "meet_card_live" || kind === "head_over" || kind === "thread_message" || kind === "morning_after";
}

const segment = (id: string) => encodeURIComponent(id);

export interface RouteIds {
  planId: string | null;
  groupId: string | null;
}

/**
 * The screen for a kind. Ticket and group kinds and `no_group` open the plan; a rejected ticket opens the ticket sheet; a rejected
 * handle opens the social settings; the meet card kinds open the meet card; the morning-after notice opens the after-the-show screen.
 * Where the group id could not be read, or the screen is not built yet (the thread, M4), the plan opens instead, and Home when there
 * is no plan to open. Unknown kinds open Home.
 */
export function routeForNotice(kind: NoticeKind, { planId, groupId }: RouteIds): string {
  const plan = planId === null ? HOME : `/plans/${segment(planId)}`;
  switch (kind) {
    case "ticket_approved":
    case "group_confirmed":
    case "group_changed":
    case "group_smaller":
    case "group_called_off":
    case "no_group":
      return plan;
    case "ticket_rejected":
      return planId === null ? HOME : `/plans/${segment(planId)}/ticket`;
    case "handle_rejected":
      return "/settings/social";
    case "meet_card_live":
    case "head_over":
      return groupId === null ? plan : `/groups/${segment(groupId)}/meet`;
    case "morning_after":
      return groupId === null ? plan : `/groups/${segment(groupId)}/after`;
    case "thread_message":
      return plan;
    default:
      return HOME;
  }
}

/** The route for push data that failed to parse (a kind this build does not know, or a payload that is not ours). */
export const UNKNOWN_PUSH_ROUTE = HOME;

/** A thread push is held back while that same thread is on screen, because the message is already in front of the person. */
export function holdsThreadPush(kind: NoticeKind, pushGroupId: string | null, openThreadGroupId: string | null): boolean {
  return kind === "thread_message" && openThreadGroupId !== null && pushGroupId === openThreadGroupId;
}
