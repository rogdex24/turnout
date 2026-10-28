import { z } from "zod";

/** Every kind of notice, and so of push. The text a push shows is the fixed line for its kind in `NOTICE_PUSH_TEXT`. */
export const NOTICE_KINDS = [
  "ticket_approved",
  "ticket_rejected",
  "handle_rejected",
  "group_confirmed",
  "group_changed",
  "group_smaller",
  "group_called_off",
  "no_group",
  "meet_card_live",
  "head_over",
  "thread_message",
  "morning_after",
] as const;
export const noticeKindSchema = z.enum(NOTICE_KINDS);
export type NoticeKind = z.infer<typeof noticeKindSchema>;

/**
 * The words on the lock screen. They are the same for everyone and never name a person, a show, a cafe, a reason or a message:
 * the app fetches the notice and shows the detail inside the app.
 */
export const NOTICE_PUSH_TEXT: Readonly<Record<NoticeKind, { title: string; body: string }>> = {
  ticket_approved: { title: "Turnout", body: "Your ticket was approved." },
  ticket_rejected: { title: "Turnout", body: "Your ticket needs another look." },
  handle_rejected: { title: "Turnout", body: "Your profile link needs an update." },
  group_confirmed: { title: "Turnout", body: "You have a group." },
  group_changed: { title: "Turnout", body: "Your group has changed." },
  group_smaller: { title: "Turnout", body: "Your group is a little smaller now." },
  group_called_off: { title: "Turnout", body: "Your group will not go ahead." },
  no_group: { title: "Turnout", body: "There is news about your plan." },
  meet_card_live: { title: "Turnout", body: "Meet your group." },
  head_over: { title: "Turnout", body: "Time to head over." },
  thread_message: { title: "Turnout", body: "New message in your group." },
  morning_after: { title: "Turnout", body: "How did it go?" },
};

/** The push payload: ids and the kind, nothing else. The app fetches the notice and routes from it. */
export const pushPayloadSchema = z.object({ kind: noticeKindSchema, noticeId: z.string(), planId: z.string().nullable() }).strict();
export type PushPayload = z.infer<typeof pushPayloadSchema>;

export const noticeSchema = z.object({
  id: z.string(),
  kind: noticeKindSchema,
  planId: z.string().nullable(),
  groupId: z.string().nullable(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type Notice = z.infer<typeof noticeSchema>;

/** GET /notices?after=<id>: the notices newer than `after`, oldest first. */
export const noticeListQuerySchema = z.object({ after: z.string().min(1).max(40).optional() }).strict();
export type NoticeListQuery = z.infer<typeof noticeListQuerySchema>;

export const noticeListResponseSchema = z.object({ notices: z.array(noticeSchema) });
export type NoticeListResponse = z.infer<typeof noticeListResponseSchema>;

/** POST /notices/read: marks every notice up to and including `upTo` as read. */
export const noticeReadRequestSchema = z.object({ upTo: z.string().min(1).max(40) }).strict();
export type NoticeReadRequest = z.infer<typeof noticeReadRequestSchema>;

export const noticeReadResponseSchema = z.object({ marked: z.number().int() });
export type NoticeReadResponse = z.infer<typeof noticeReadResponseSchema>;
