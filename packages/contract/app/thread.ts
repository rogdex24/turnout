import { z } from "zod";

export const MESSAGE_MAX_CHARS = 1000;

/** What counts as a character: a code point, the way the database counts length. */
const chars = (value: string): number => [...value].length;

/** An HTML tag. Messages are plain text, so one is refused rather than escaped. */
const HTML_TAG = /<\/?[a-zA-Z!][^>]*>/;

/** POST /groups/:groupId/messages. The text is trimmed; `clientId` makes a retry store once. */
export const postMessageRequestSchema = z
  .object({
    body: z
      .string()
      .trim()
      .refine((value) => chars(value) >= 1 && chars(value) <= MESSAGE_MAX_CHARS, "the message must be 1 to 1,000 characters")
      .refine((value) => !HTML_TAG.test(value), "the message is plain text, no HTML"),
    clientId: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();
export type PostMessageRequest = z.infer<typeof postMessageRequestSchema>;

export const messageSchema = z.object({
  id: z.string(),
  memberRef: z.string(),
  firstName: z.string(),
  body: z.string(),
  createdAt: z.string(),
  isYou: z.boolean(),
});
export type Message = z.infer<typeof messageSchema>;

/** GET /groups/:groupId/messages?after=<id>: up to 100 newer messages, oldest first. A message stored later always has a larger id, so the last id read is a safe cursor. */
export const messageListQuerySchema = z.object({ after: z.string().min(1).max(40).optional() }).strict();
export const messageListResponseSchema = z.object({
  messages: z.array(messageSchema),
  /** `open` while a member can post, `read_only` after T+24h. The route does not answer outside those two. */
  thread: z.enum(["open", "read_only"]),
});
export type MessageListResponse = z.infer<typeof messageListResponseSchema>;
