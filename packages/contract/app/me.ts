import { z } from "zod";
import { genderSchema, groupPrefSchema, handleKindSchema, handleRejectReasonSchema, handleStateSchema } from "../profile.js";

/** The states a signed-in member can be in. `banned` and `deleted` never get a token. */
export const MEMBER_STATES = ["active", "suspended", "stopped"] as const;
export const memberStateSchema = z.enum(MEMBER_STATES);
export type MemberState = z.infer<typeof memberStateSchema>;

/** What is still missing before a person can be put in a group. */
export const MATCHABLE_ITEMS = ["phone", "account", "name", "gender", "photo", "handle"] as const;
export const matchableItemSchema = z.enum(MATCHABLE_ITEMS);
export type MatchableItem = z.infer<typeof matchableItemSchema>;

/** A link to a stored file. `url` is a path on the API origin (disk and memory stores) or an absolute presigned URL (s3); it stops working at `expiresAt` (5 minutes). */
export const fileLinkSchema = z.object({ url: z.string(), expiresAt: z.string() });
export type FileLink = z.infer<typeof fileLinkSchema>;

/** GET /me. */
export const meResponseSchema = z.object({
  status: memberStateSchema,
  phoneLast4: z.string(),
  profile: z.object({
    firstName: z.string().nullable(),
    gender: genderSchema.nullable(),
    groupPref: groupPrefSchema,
    photo: fileLinkSchema.nullable(),
  }),
  handle: z.object({
    state: handleStateSchema,
    kind: handleKindSchema.nullable(),
    handle: z.string().nullable(),
    rejectReason: handleRejectReasonSchema.nullable(),
  }),
  matchable: z.object({ ok: z.boolean(), missing: z.array(matchableItemSchema) }),
  consent: z.object({ noticeVersion: z.string().nullable(), current: z.boolean() }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** POST /me/consent. */
export const consentRequestSchema = z.object({ noticeVersion: z.string().min(1).max(40) }).strict();
export type ConsentRequest = z.infer<typeof consentRequestSchema>;

export const consentResponseSchema = z.object({ noticeVersion: z.string(), givenAt: z.string() });
export type ConsentResponse = z.infer<typeof consentResponseSchema>;

/** PUT /me/handle. */
export const handleResponseSchema = z.object({ state: z.literal("pending") });
export type HandleResponse = z.infer<typeof handleResponseSchema>;

/** The photo upload limit and what it accepts. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** GET /me/photo and the answer to PUT /me/photo. */
export const photoResponseSchema = z.object({ photo: fileLinkSchema });
export type PhotoResponse = z.infer<typeof photoResponseSchema>;
