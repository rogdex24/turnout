import { z } from "zod";
import { fileLinkSchema } from "./me.js";
import { showSnapshotSchema } from "./plans.js";

/** What the app sees of a group. `called_off` and `dissolved` groups are plan reasons, never a group the app can open. */
export const GROUP_STATES = ["confirmed", "locked", "live", "done"] as const;
export const groupStateSchema = z.enum(GROUP_STATES);
export type GroupState = z.infer<typeof groupStateSchema>;

/** GET /groups/:groupId before T-3h. Nothing here names, counts by name or points at another member. */
export const groupBeforeRevealSchema = z.object({
  state: groupStateSchema,
  size: z.number().int(),
  /** The group is smaller than the usual minimum but still going ahead. */
  belowPlan: z.boolean(),
  revealAt: z.string(),
  meetAt: z.string(),
  showSnapshot: showSnapshotSchema,
});
export type GroupBeforeReveal = z.infer<typeof groupBeforeRevealSchema>;

/** `memberRef` is opaque and belongs to one group: the same person has another one in the next group. */
export const groupMemberSchema = z.object({
  memberRef: z.string(),
  firstName: z.string(),
  /** A signed link, good for 5 minutes, or null when the member has no photo. */
  photoUrl: z.string().nullable(),
  checkedIn: z.boolean(),
  isYou: z.boolean(),
});
export type GroupMember = z.infer<typeof groupMemberSchema>;

/** Where to meet. The venue's entrance when the operator has not named a cafe (`isFallback`). */
export const cafeSchema = z.object({
  name: z.string(),
  address: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  isFallback: z.boolean(),
});
export type Cafe = z.infer<typeof cafeSchema>;

/** GET /groups/:groupId from T-3h. */
export const groupRevealedSchema = groupBeforeRevealSchema.extend({
  cafe: cafeSchema,
  members: z.array(groupMemberSchema),
});
export type GroupRevealed = z.infer<typeof groupRevealedSchema>;

export const groupResponseSchema = z.union([groupRevealedSchema, groupBeforeRevealSchema]);
export type GroupResponse = z.infer<typeof groupResponseSchema>;

/** GET /groups/:groupId/members/:memberRef/photo. */
export const memberPhotoResponseSchema = z.object({ photo: fileLinkSchema });
export type MemberPhotoResponse = z.infer<typeof memberPhotoResponseSchema>;

/** POST /groups/:groupId/checkin takes no body and no coordinates: a body with any field is refused. */
export const checkinRequestSchema = z.object({}).strict();
export const checkinResponseSchema = z.object({ checkedIn: z.literal(true) });
export type CheckinResponse = z.infer<typeof checkinResponseSchema>;
